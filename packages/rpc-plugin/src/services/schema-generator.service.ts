import { createGenerator } from 'ts-json-schema-generator'
import { MethodDeclaration, Project } from 'ts-morph'
import type { SchemaInfo } from '../types/schema.types'
import { generateTypeScriptInterface } from '../utils/schema-utils'
import { extractNamedType } from '../utils/type-utils'

/**
 * Service for generating JSON schemas from TypeScript types used in controllers
 */
export class SchemaGeneratorService {
	constructor(
		private readonly controllerPattern: string,
		private readonly tsConfigPath: string
	) {}

	// Track projects for cleanup
	private projects: Project[] = []

	/**
	 * Generates JSON schemas from types used in controllers
	 */
	async generateSchemas(): Promise<SchemaInfo[]> {
		const project = this.createProject()
		const sourceFiles = project.getSourceFiles(this.controllerPattern)

		const collectedTypes = this.collectTypesFromControllers(sourceFiles)
		return this.processTypes(collectedTypes)
	}

	/**
	 * Creates a new ts-morph project
	 */
	private createProject(): Project {
		const project = new Project({
			tsConfigFilePath: this.tsConfigPath
		})

		this.projects.push(project)
		return project
	}

	/**
	 * Cleanup resources to prevent memory leaks
	 */
	dispose(): void {
		this.projects.forEach((project) => {
			// Remove all source files to free memory
			project.getSourceFiles().forEach((file) => project.removeSourceFile(file))
		})
		this.projects = []
	}

	/**
	 * Collects types from controller files
	 */
	private collectTypesFromControllers(sourceFiles: readonly any[]): Set<string> {
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
		// Collect parameter types
		for (const param of method.getParameters()) {
			const type = extractNamedType(param.getType())
			if (type) collectedTypes.add(type)
		}

		// Collect return type
		const returnType = method.getReturnType()
		const innerType = returnType.getTypeArguments()[0] ?? returnType
		const type = extractNamedType(innerType)
		if (type) collectedTypes.add(type)
	}

	/**
	 * Processes collected types to generate schemas
	 */
	private async processTypes(collectedTypes: Set<string>): Promise<SchemaInfo[]> {
		const schemas: SchemaInfo[] = []

		for (const typeName of collectedTypes) {
			try {
				const schema = await this.generateSchemaForType(typeName)
				const typescriptType = generateTypeScriptInterface(typeName, schema)

				schemas.push({
					type: typeName,
					schema,
					typescriptType
				})
			} catch (err) {
				console.error(`Failed to generate schema for ${typeName}:`, err)
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
			console.error(`Failed to generate schema for type ${typeName}:`, error)
			// Return a basic schema structure as fallback
			return {
				type: 'object',
				properties: {},
				required: []
			}
		}
	}
}
