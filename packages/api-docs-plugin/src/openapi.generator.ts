import fs from 'fs/promises'
import path from 'path'
import type { OpenAPIV3 } from 'openapi-types'

export interface OpenApiGenerationOptions {
	readonly title?: string
	readonly version?: string
	readonly description?: string
	readonly servers?: readonly { url: string; description?: string }[]
}

export interface OpenApiArtifactInput {
	readonly artifactVersion?: string
	readonly routes: readonly OpenApiRouteInput[]
	readonly schemas: readonly OpenApiSchemaInput[]
}

export interface OpenApiRouteInput {
	readonly method: string
	readonly handler: string
	readonly controller: string
	readonly fullPath: string
	readonly path?: string
	readonly prefix?: string
	readonly version?: string
	readonly route?: string
	readonly returns?: string
	readonly parameters?: readonly OpenApiParameterInput[]
}

export interface OpenApiParameterInput {
	readonly name: string
	readonly data?: string
	readonly type: string
	readonly required?: boolean
	readonly decoratorType: string
}

export interface OpenApiSchemaInput {
	readonly type: string
	readonly schema: Record<string, any>
}

/** OpenAPI 3.x document type (openapi-types). */
export type OpenApiDocument = OpenAPIV3.Document

interface ResolvedOpenApiOptions {
	readonly title: string
	readonly version: string
	readonly description: string
	readonly servers: readonly { url: string; description?: string }[]
}

function resolveOptions(options: OpenApiGenerationOptions = {}): ResolvedOpenApiOptions {
	return {
		title: options.title ?? 'API',
		version: options.version ?? '1.0.0',
		description: options.description ?? '',
		servers: options.servers ?? []
	}
}

export function fromArtifactSync(
	artifact: OpenApiArtifactInput,
	options: OpenApiGenerationOptions = {}
): OpenApiDocument {
	const resolved = resolveOptions(options)
	const schemaMap = buildSchemaMap(artifact.schemas)
	const spec: OpenAPIV3.Document = {
		openapi: '3.0.3',
		info: {
			title: resolved.title,
			version: resolved.version,
			description: resolved.description
		},
		paths: {},
		components: {
			schemas: schemaMap as OpenAPIV3.ComponentsObject['schemas']
		}
	}

	if (resolved.servers.length > 0) {
		spec.servers = resolved.servers.map((server) => ({ ...server }))
	}

	for (const route of artifact.routes) {
		const routePath =
			route.prefix != null || route.version != null || route.route != null
				? buildFallbackPath(route)
				: route.fullPath || buildFallbackPath(route)
		const openApiPath = toOpenApiPath(routePath)
		const method = route.method.toLowerCase() as keyof OpenAPIV3.PathItemObject
		if (!spec.paths[openApiPath]) {
			spec.paths[openApiPath] = {}
		}
		;(spec.paths[openApiPath] as Record<string, OpenAPIV3.OperationObject>)[method] = buildOperation(
			route,
			schemaMap
		)
	}

	return spec
}

export async function fromArtifact(
	artifact: OpenApiArtifactInput,
	options: OpenApiGenerationOptions = {}
): Promise<OpenApiDocument> {
	return fromArtifactSync(artifact, options)
}

export async function write(openapi: OpenApiDocument, outputPath: string): Promise<string> {
	const absolute = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath)
	await fs.mkdir(path.dirname(absolute), { recursive: true })
	await fs.writeFile(absolute, JSON.stringify(openapi, null, 2), 'utf-8')
	return absolute
}

function buildOperation(
	route: OpenApiRouteInput,
	schemaMap: Record<string, Record<string, any>>
): OpenAPIV3.OperationObject {
	const controllerName = route.controller.replace(/Controller$/, '')
	const parameters = route.parameters ?? []
	const operation: OpenAPIV3.OperationObject = {
		operationId: route.handler,
		tags: [controllerName],
		responses: buildResponses(route.returns, schemaMap)
	}

	const openApiParameters = buildParameters(parameters)
	if (openApiParameters.length > 0) {
		operation.parameters = openApiParameters
	}

	const requestBody = buildRequestBody(parameters, schemaMap)
	if (requestBody) {
		operation.requestBody = requestBody
	}

	return operation
}

function buildParameters(parameters: readonly OpenApiParameterInput[]): OpenAPIV3.ParameterObject[] {
	const result: OpenAPIV3.ParameterObject[] = []

	for (const param of parameters) {
		if (param.decoratorType === 'param') {
			result.push({
				name: param.data ?? param.name,
				in: 'path',
				required: true,
				schema: tsTypeToJsonSchema(param.type)
			})
		} else if (param.decoratorType === 'query') {
			result.push({
				name: param.data ?? param.name,
				in: 'query',
				required: param.required === true,
				schema: tsTypeToJsonSchema(param.type)
			})
		}
	}

	return result
}

function buildRequestBody(
	parameters: readonly OpenApiParameterInput[],
	schemaMap: Record<string, Record<string, any>>
): OpenAPIV3.RequestBodyObject | null {
	const bodyParam = parameters.find((param) => param.decoratorType === 'body')
	if (!bodyParam) return null

	const typeName = extractBaseTypeName(bodyParam.type)
	const schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject =
		typeName && schemaMap[typeName] ? { $ref: `#/components/schemas/${typeName}` } : { type: 'object' as const }

	return {
		required: true,
		content: {
			'application/json': { schema }
		}
	}
}

function buildResponses(
	returns: string | undefined,
	schemaMap: Record<string, Record<string, any>>
): OpenAPIV3.ResponsesObject {
	const responseSchema = resolveResponseSchema(returns, schemaMap)

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

function resolveResponseSchema(
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
		const primitiveSchema = tsTypeToJsonSchema(baseType)
		return isArray ? { type: 'array', items: primitiveSchema } : primitiveSchema
	}
	if (['void', 'any', 'unknown'].includes(baseType)) return null
	if (schemaMap[baseType]) {
		const ref = { $ref: `#/components/schemas/${baseType}` }
		return isArray ? { type: 'array', items: ref } : ref
	}
	return null
}

function buildSchemaMap(schemas: readonly OpenApiSchemaInput[]): Record<string, Record<string, any>> {
	const result: Record<string, Record<string, any>> = {}
	for (const schemaInfo of schemas) {
		const definition = schemaInfo.schema?.definitions?.[schemaInfo.type]
		if (definition) {
			result[schemaInfo.type] = definition
		}
	}
	return result
}

function tsTypeToJsonSchema(tsType: string): Record<string, unknown> {
	switch (tsType) {
		case 'number':
			return { type: 'number' as const }
		case 'boolean':
			return { type: 'boolean' as const }
		case 'string':
		default:
			return { type: 'string' as const }
	}
}

function extractBaseTypeName(tsType: string): string | null {
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

function toOpenApiPath(expressPath: string): string {
	return expressPath.replace(/:(\w+)/g, '{$1}')
}

function buildFallbackPath(route: OpenApiRouteInput): string {
	const parts = [route.prefix, route.version, route.route, route.path]
		.filter((part) => part !== undefined && part !== null && part !== '')
		.map((part) => String(part).replace(/^\/+|\/+$/g, ''))
		.filter((part) => part.length > 0)
	const joined = parts.join('/')
	return `/${joined}`
}
