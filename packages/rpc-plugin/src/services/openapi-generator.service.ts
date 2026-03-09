import fs from 'fs/promises'
import path from 'path'
import type { ExtendedRouteInfo, ParameterMetadataWithType } from '../types/route.types'
import type { SchemaInfo } from '../types/schema.types'
import { buildFullApiPath } from '../utils/path-utils'
import { safeToString } from '../utils/string-utils'

export interface ResolvedOpenApiOptions {
	readonly title: string
	readonly version: string
	readonly description: string
	readonly servers: readonly { url: string; description?: string }[]
	readonly outputFile: string
}

type OpenApiSpec = {
	openapi: string
	info: { title: string; version: string; description: string }
	servers?: { url: string; description?: string }[]
	paths: Record<string, Record<string, OpenApiOperation>>
	components: { schemas: Record<string, Record<string, any>> }
}

type OpenApiOperation = {
	operationId: string
	tags: string[]
	parameters?: OpenApiParameter[]
	requestBody?: Record<string, any>
	responses: Record<string, Record<string, any>>
}

type OpenApiParameter = {
	name: string
	in: 'path' | 'query'
	required: boolean
	schema: Record<string, any>
}

/**
 * Service for generating OpenAPI 3.0.3 specifications from analyzed routes and schemas
 */
export class OpenApiGeneratorService {
	constructor(private readonly outputDir: string) {}

	async generateSpec(
		routes: readonly ExtendedRouteInfo[],
		schemas: readonly SchemaInfo[],
		options: ResolvedOpenApiOptions
	): Promise<string> {
		await fs.mkdir(this.outputDir, { recursive: true })

		const schemaMap = this.buildSchemaMap(schemas)
		const spec = this.buildSpec(routes, schemaMap, options)

		const outputPath = path.join(this.outputDir, options.outputFile)
		await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf-8')
		return outputPath
	}

	private buildSpec(
		routes: readonly ExtendedRouteInfo[],
		schemaMap: Record<string, Record<string, any>>,
		options: ResolvedOpenApiOptions
	): OpenApiSpec {
		const spec: OpenApiSpec = {
			openapi: '3.0.3',
			info: {
				title: options.title,
				version: options.version,
				description: options.description
			},
			paths: {},
			components: { schemas: schemaMap }
		}

		if (options.servers.length > 0) {
			spec.servers = options.servers.map((s) => ({ ...s }))
		}

		for (const route of routes) {
			const apiPath = this.toOpenApiPath(buildFullApiPath(route))
			const method = safeToString(route.method).toLowerCase()

			if (!spec.paths[apiPath]) {
				spec.paths[apiPath] = {}
			}

			spec.paths[apiPath][method] = this.buildOperation(route, schemaMap)
		}

		return spec
	}

	private buildOperation(
		route: ExtendedRouteInfo,
		schemaMap: Record<string, Record<string, any>>
	): OpenApiOperation {
		const controllerName = safeToString(route.controller).replace(/Controller$/, '')
		const handlerName = safeToString(route.handler)
		const parameters = route.parameters || []

		const operation: OpenApiOperation = {
			operationId: handlerName,
			tags: [controllerName],
			responses: this.buildResponses(route.returns, schemaMap)
		}

		const openApiParams = this.buildParameters(parameters)
		if (openApiParams.length > 0) {
			operation.parameters = openApiParams
		}

		const requestBody = this.buildRequestBody(parameters, schemaMap)
		if (requestBody) {
			operation.requestBody = requestBody
		}

		return operation
	}

	private buildParameters(parameters: readonly ParameterMetadataWithType[]): OpenApiParameter[] {
		const result: OpenApiParameter[] = []

		for (const param of parameters) {
			if (param.decoratorType === 'param') {
				result.push({
					name: param.data ?? param.name,
					in: 'path',
					required: true,
					schema: this.tsTypeToJsonSchema(param.type)
				})
			} else if (param.decoratorType === 'query') {
				if (param.data) {
					result.push({
						name: param.data,
						in: 'query',
						required: param.required === true,
						schema: this.tsTypeToJsonSchema(param.type)
					})
				} else {
					result.push({
						name: param.name,
						in: 'query',
						required: param.required === true,
						schema: this.tsTypeToJsonSchema(param.type)
					})
				}
			}
		}

		return result
	}

	private buildRequestBody(
		parameters: readonly ParameterMetadataWithType[],
		schemaMap: Record<string, Record<string, any>>
	): Record<string, any> | null {
		const bodyParams = parameters.filter((p) => p.decoratorType === 'body')
		if (bodyParams.length === 0) return null

		const bodyParam = bodyParams[0]
		const typeName = this.extractBaseTypeName(bodyParam.type)

		let schema: Record<string, any>
		if (typeName && schemaMap[typeName]) {
			schema = { $ref: `#/components/schemas/${typeName}` }
		} else {
			schema = { type: 'object' }
		}

		return {
			required: true,
			content: {
				'application/json': { schema }
			}
		}
	}

	private buildResponses(
		returns: string | undefined,
		schemaMap: Record<string, Record<string, any>>
	): Record<string, Record<string, any>> {
		const responseSchema = this.resolveResponseSchema(returns, schemaMap)

		if (!responseSchema) {
			return { '200': { description: 'Successful response' } }
		}

		return {
			'200': {
				description: 'Successful response',
				content: {
					'application/json': { schema: responseSchema }
				}
			}
		}
	}

	private resolveResponseSchema(
		returns: string | undefined,
		schemaMap: Record<string, Record<string, any>>
	): Record<string, any> | null {
		if (!returns) return null

		let innerType = returns
		const promiseMatch = returns.match(/^Promise<(.+)>$/)
		if (promiseMatch) {
			innerType = promiseMatch[1]
		}

		const isArray = innerType.endsWith('[]')
		const baseType = isArray ? innerType.slice(0, -2) : innerType

		if (['string', 'number', 'boolean'].includes(baseType)) {
			const primitiveSchema = this.tsTypeToJsonSchema(baseType)
			return isArray ? { type: 'array', items: primitiveSchema } : primitiveSchema
		}

		if (['void', 'any', 'unknown'].includes(baseType)) return null

		if (schemaMap[baseType]) {
			const ref = { $ref: `#/components/schemas/${baseType}` }
			return isArray ? { type: 'array', items: ref } : ref
		}

		return null
	}

	private buildSchemaMap(schemas: readonly SchemaInfo[]): Record<string, Record<string, any>> {
		const result: Record<string, Record<string, any>> = {}

		for (const schemaInfo of schemas) {
			const definition = schemaInfo.schema?.definitions?.[schemaInfo.type]
			if (definition) {
				result[schemaInfo.type] = definition
			}
		}

		return result
	}

	/**
	 * Converts Express-style `:param` path to OpenAPI `{param}` syntax
	 */
	private toOpenApiPath(expressPath: string): string {
		return expressPath.replace(/:(\w+)/g, '{$1}')
	}

	private tsTypeToJsonSchema(tsType: string): Record<string, any> {
		switch (tsType) {
			case 'number':
				return { type: 'number' }
			case 'boolean':
				return { type: 'boolean' }
			case 'string':
			default:
				return { type: 'string' }
		}
	}

	/**
	 * Extracts the base type name from a TS type string, stripping
	 * wrappers like `Partial<...>`, `...[]`, `Promise<...>`.
	 */
	private extractBaseTypeName(tsType: string): string | null {
		if (!tsType) return null

		let type = tsType
		const promiseMatch = type.match(/^Promise<(.+)>$/)
		if (promiseMatch) type = promiseMatch[1]

		type = type.replace(/\[\]$/, '')

		const genericMatch = type.match(/^\w+<(\w+)>$/)
		if (genericMatch) type = genericMatch[1]

		if (['string', 'number', 'boolean', 'any', 'void', 'unknown', 'object'].includes(type)) {
			return null
		}

		return type
	}
}
