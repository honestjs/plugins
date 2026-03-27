import { createGenerator } from 'ts-json-schema-generator'
import { MethodDeclaration, Project, SourceFile } from 'ts-morph'
import type { SchemaInfo } from '../types/schema.types'
import { generateTypeScriptInterface } from '../utils/schema-utils'
import { extractNamedTypes } from '../utils/type-utils'

export interface SchemaGeneratorOptions {
	readonly failOnSchemaError?: boolean
	readonly onWarn?: (message: string, details?: unknown) => void
}

/**
 * Service for generating JSON schemas from TypeScript types used in controllers
 */
export class SchemaGeneratorService {
	private readonly failOnSchemaError: boolean
	private readonly onWarn?: (message: string, details?: unknown) => void
	private warnings: string[] = []

	constructor(
		private readonly controllerPattern: string,
		private readonly tsConfigPath: string,
		options: SchemaGeneratorOptions = {}
	) {
		this.failOnSchemaError = options.failOnSchemaError ?? false
		this.onWarn = options.onWarn
	}

	getWarnings(): readonly string[] {
		return this.warnings
	}

	/**
	 * Generates JSON schemas from types used in controllers
	 */
	async generateSchemas(project: Project): Promise<SchemaInfo[]> {
		this.warnings = []
		const sourceFiles = project.getSourceFiles(this.controllerPattern)

		const collectedTypes = this.collectTypesFromControllers(sourceFiles)
		return this.processTypes(collectedTypes)
	}

	/**
	 * Generates JSON schemas from a precomputed set of type names.
	 */
	async generateSchemasFromCollectedTypes(collectedTypes: ReadonlySet<string>): Promise<SchemaInfo[]> {
		this.warnings = []
		return this.processTypes(new Set(collectedTypes))
	}

	/**
	 * Collects types from controller files
	 */
	private collectTypesFromControllers(sourceFiles: readonly SourceFile[]): Set<string> {
		const collectedTypes = new Set<string>()

		for (const file of sourceFiles) {
			for (const cls of file.getClasses()) {
				for (const method of cls.getMethods()) {
					this.collectTypesFromMethod(method, collectedTypes)
				}
			}
		}

		return collectedTypes
	}

	/**
	 * Collects types from a single method
	 */
	private collectTypesFromMethod(method: MethodDeclaration, collectedTypes: Set<string>): void {
		// Collect parameter types (including union members, e.g. TodoStatus | undefined)
		for (const param of method.getParameters()) {
			for (const name of extractNamedTypes(param.getType())) {
				collectedTypes.add(name)
			}
		}

		// Collect return type
		const returnType = method.getReturnType()
		const innerType = returnType.getTypeArguments()[0] ?? returnType
		for (const name of extractNamedTypes(innerType)) {
			collectedTypes.add(name)
		}
	}

	/**
	 * Processes collected types to generate schemas
	 */
	private async processTypes(collectedTypes: Set<string>): Promise<SchemaInfo[]> {
		const schemas: SchemaInfo[] = []
		if (collectedTypes.size === 0) {
			return schemas
		}

		for (const typeName of collectedTypes) {
			try {
				const schema = await this.generateSchemaForType(typeName)
				const definitionsKeys = Object.keys(schema?.definitions || {}) || []
				const types: string[] = []

				// fallback when schema has no definitions
				if (definitionsKeys.length === 0) {
					types.push(generateTypeScriptInterface(typeName, schema, this.onWarn))
				} else {
					for (const definitionKey of definitionsKeys) {
						types.push(generateTypeScriptInterface(definitionKey, schema, this.onWarn))
					}
				}

				schemas.push({
					type: typeName,
					schema,
					typescriptType: types.join('\n\n')
				})
			} catch (err) {
				if (this.failOnSchemaError) {
					throw err
				}

				const warning = `Failed to generate schema for ${typeName}`
				this.warnings.push(warning)
				this.onWarn?.(warning, err)
			}
		}

		return schemas
	}

	/**
	 * Generates schema for a specific type
	 */
	private async generateSchemaForType(typeName: string): Promise<Record<string, any>> {
		try {
			const generator = createGenerator({
				path: this.controllerPattern,
				tsconfig: this.tsConfigPath,
				type: typeName,
				skipTypeCheck: false // Enable type checking for better error detection
			})

			return generator.createSchema(typeName)
		} catch (error) {
			if (this.failOnSchemaError) {
				throw error
			}
			const warning = `Failed to generate schema for type ${typeName}`
			this.warnings.push(warning)
			this.onWarn?.(warning, error)
			// Return a basic schema structure as fallback
			return {
				type: 'object',
				properties: {},
				required: []
			}
		}
	}
}
