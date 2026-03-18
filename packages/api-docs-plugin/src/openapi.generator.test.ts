import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { fromArtifactSync, fromArtifact, write } from './openapi.generator'
import type { OpenApiArtifactInput, OpenApiRouteInput, OpenApiSchemaInput } from './openapi.generator'

const userSchema: OpenApiSchemaInput = {
	type: 'User',
	schema: {
		definitions: {
			User: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					name: { type: 'string' }
				},
				required: ['id']
			}
		}
	}
}

const createDtoSchema: OpenApiSchemaInput = {
	type: 'CreateUserDto',
	schema: {
		definitions: {
			CreateUserDto: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					email: { type: 'string' }
				},
				required: ['name', 'email']
			}
		}
	}
}

function makeRoute(overrides: Partial<OpenApiRouteInput> = {}): OpenApiRouteInput {
	return {
		method: 'GET',
		handler: 'index',
		controller: 'TestController',
		fullPath: '/test',
		parameters: [],
		...overrides
	}
}

function makeArtifact(overrides: Partial<OpenApiArtifactInput> = {}): OpenApiArtifactInput {
	return {
		routes: [],
		schemas: [],
		...overrides
	}
}

describe('openapi.generator', () => {
	describe('fromArtifactSync', () => {
		it('returns a valid OpenAPI 3.0.3 document', () => {
			const doc = fromArtifactSync(makeArtifact())

			expect(doc.openapi).toBe('3.0.3')
			expect(doc.info).toBeDefined()
			expect(doc.paths).toBeDefined()
			expect(doc.components?.schemas).toBeDefined()
		})

		it('uses default options when none provided', () => {
			const doc = fromArtifactSync(makeArtifact())

			expect(doc.info.title).toBe('API')
			expect(doc.info.version).toBe('1.0.0')
			expect(doc.info.description).toBe('')
			expect(doc.servers).toBeUndefined()
		})

		it('applies custom title, version, description', () => {
			const doc = fromArtifactSync(makeArtifact(), {
				title: 'My API',
				version: '2.0.0',
				description: 'A test API'
			})

			expect(doc.info.title).toBe('My API')
			expect(doc.info.version).toBe('2.0.0')
			expect(doc.info.description).toBe('A test API')
		})

		it('includes servers when provided', () => {
			const doc = fromArtifactSync(makeArtifact(), {
				servers: [
					{ url: 'https://api.example.com', description: 'Production' },
					{ url: 'http://localhost:3000' }
				]
			})

			expect(doc.servers).toHaveLength(2)
			expect(doc.servers![0].url).toBe('https://api.example.com')
			expect(doc.servers![0].description).toBe('Production')
			expect(doc.servers![1].url).toBe('http://localhost:3000')
		})

		it('omits servers when none provided', () => {
			const doc = fromArtifactSync(makeArtifact())
			expect(doc.servers).toBeUndefined()
		})

		it('maps routes to OpenAPI paths', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/health', method: 'GET', handler: 'check' })]
				})
			)

			expect(doc.paths['/health']).toBeDefined()
			expect(doc.paths['/health']!.get).toBeDefined()
			expect(doc.paths['/health']!.get!.operationId).toBe('check')
		})

		it('groups multiple methods under one path', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({ fullPath: '/users', method: 'GET', handler: 'list' }),
						makeRoute({ fullPath: '/users', method: 'POST', handler: 'create' })
					]
				})
			)

			expect(doc.paths['/users']!.get!.operationId).toBe('list')
			expect(doc.paths['/users']!.post!.operationId).toBe('create')
		})

		it('uses fallback path when prefix/version/route are set', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							prefix: '/api',
							version: 'v1',
							route: 'users',
							path: ':id',
							fullPath: '/api/v1/users/:id',
							handler: 'getById'
						})
					]
				})
			)

			expect(doc.paths['/api/v1/users/{id}']).toBeDefined()
		})

		it('uses fullPath when prefix/version/route are all undefined', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/custom/path',
							prefix: undefined,
							version: undefined,
							route: undefined,
							handler: 'custom'
						})
					]
				})
			)

			expect(doc.paths['/custom/path']).toBeDefined()
		})

		it('populates components.schemas from artifact schemas', () => {
			const doc = fromArtifactSync(makeArtifact({ schemas: [userSchema] }))

			expect(doc.components!.schemas!['User']).toBeDefined()
			expect((doc.components!.schemas!['User'] as any).type).toBe('object')
		})

		it('ignores schemas without matching definitions', () => {
			const brokenSchema: OpenApiSchemaInput = {
				type: 'Missing',
				schema: { definitions: {} }
			}
			const doc = fromArtifactSync(makeArtifact({ schemas: [brokenSchema] }))

			expect(doc.components!.schemas!['Missing']).toBeUndefined()
		})
	})

	describe('fromArtifact (async)', () => {
		it('returns the same result as fromArtifactSync', async () => {
			const artifact = makeArtifact({
				routes: [makeRoute({ fullPath: '/health' })],
				schemas: [userSchema]
			})
			const sync = fromArtifactSync(artifact, { title: 'Test' })
			const async_ = await fromArtifact(artifact, { title: 'Test' })

			expect(async_).toEqual(sync)
		})
	})

	describe('write', () => {
		let tempDir: string

		afterEach(() => {
			if (tempDir && fs.existsSync(tempDir)) {
				fs.rmSync(tempDir, { recursive: true })
			}
		})

		it('writes spec to absolute path', async () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-write-'))
			const outputPath = path.join(tempDir, 'spec.json')
			const doc = fromArtifactSync(makeArtifact())

			const result = await write(doc, outputPath)

			expect(result).toBe(outputPath)
			expect(fs.existsSync(outputPath)).toBe(true)
			const written = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
			expect(written.openapi).toBe('3.0.3')
		})

		it('creates intermediate directories', async () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-write-'))
			const outputPath = path.join(tempDir, 'nested', 'deep', 'spec.json')
			const doc = fromArtifactSync(makeArtifact())

			await write(doc, outputPath)

			expect(fs.existsSync(outputPath)).toBe(true)
		})
	})

	describe('path conversion', () => {
		it('converts :param to {param} in paths', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/users/:userId/posts/:postId' })]
				})
			)

			expect(doc.paths['/users/{userId}/posts/{postId}']).toBeDefined()
		})

		it('handles paths without parameters', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/health' })]
				})
			)

			expect(doc.paths['/health']).toBeDefined()
		})
	})

	describe('buildFallbackPath', () => {
		it('assembles path from prefix, version, route, and path segments', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							prefix: '/api',
							version: 'v2',
							route: 'items',
							path: ':id',
							handler: 'get'
						})
					]
				})
			)

			expect(doc.paths['/api/v2/items/{id}']).toBeDefined()
		})

		it('handles empty/missing segments', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							prefix: '',
							version: undefined,
							route: 'items',
							path: undefined,
							handler: 'list'
						})
					]
				})
			)

			expect(doc.paths['/items']).toBeDefined()
		})
	})

	describe('operation generation', () => {
		it('strips "Controller" suffix for tags', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ controller: 'UsersController', fullPath: '/users' })]
				})
			)

			const op = doc.paths['/users']!.get!
			expect(op.tags).toEqual(['Users'])
		})

		it('uses controller name as-is when no Controller suffix', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ controller: 'Health', fullPath: '/health' })]
				})
			)

			const op = doc.paths['/health']!.get!
			expect(op.tags).toEqual(['Health'])
		})

		it('sets operationId from handler name', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ handler: 'findAll', fullPath: '/items' })]
				})
			)

			expect(doc.paths['/items']!.get!.operationId).toBe('findAll')
		})
	})

	describe('parameters', () => {
		it('maps param decorator to path parameter', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/users/:id',
							parameters: [
								{ name: 'id', data: 'id', type: 'string', decoratorType: 'param', required: true }
							]
						})
					]
				})
			)

			const params = doc.paths['/users/{id}']!.get!.parameters as any[]
			expect(params).toHaveLength(1)
			expect(params[0].name).toBe('id')
			expect(params[0].in).toBe('path')
			expect(params[0].required).toBe(true)
			expect(params[0].schema).toEqual({ type: 'string' })
		})

		it('maps query decorator to query parameter', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/search',
							parameters: [
								{ name: 'q', data: 'q', type: 'string', decoratorType: 'query', required: false }
							]
						})
					]
				})
			)

			const params = doc.paths['/search']!.get!.parameters as any[]
			expect(params).toHaveLength(1)
			expect(params[0].name).toBe('q')
			expect(params[0].in).toBe('query')
			expect(params[0].required).toBe(false)
		})

		it('uses param.data for name, falling back to param.name', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/test',
							parameters: [
								{ name: 'fallbackName', type: 'string', decoratorType: 'param' }
							]
						})
					]
				})
			)

			const params = doc.paths['/test']!.get!.parameters as any[]
			expect(params[0].name).toBe('fallbackName')
		})

		it('maps number and boolean parameter types', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/items',
							parameters: [
								{ name: 'page', data: 'page', type: 'number', decoratorType: 'query' },
								{ name: 'active', data: 'active', type: 'boolean', decoratorType: 'query' }
							]
						})
					]
				})
			)

			const params = doc.paths['/items']!.get!.parameters as any[]
			expect(params[0].schema).toEqual({ type: 'number' })
			expect(params[1].schema).toEqual({ type: 'boolean' })
		})

		it('ignores non-param/query decorators (e.g. body) in parameters list', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/users',
							method: 'POST',
							parameters: [
								{ name: 'dto', type: 'CreateUserDto', decoratorType: 'body' }
							]
						})
					]
				})
			)

			const op = doc.paths['/users']!.post!
			expect(op.parameters).toBeUndefined()
		})
	})

	describe('request body', () => {
		it('generates request body with $ref for known schema type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/users',
							method: 'POST',
							handler: 'create',
							parameters: [
								{ name: 'dto', type: 'CreateUserDto', decoratorType: 'body' }
							]
						})
					],
					schemas: [createDtoSchema]
				})
			)

			const body = doc.paths['/users']!.post!.requestBody as any
			expect(body.required).toBe(true)
			expect(body.content['application/json'].schema).toEqual({
				$ref: '#/components/schemas/CreateUserDto'
			})
		})

		it('falls back to generic object when body type is unknown', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/users',
							method: 'POST',
							parameters: [
								{ name: 'dto', type: 'UnknownDto', decoratorType: 'body' }
							]
						})
					]
				})
			)

			const body = doc.paths['/users']!.post!.requestBody as any
			expect(body.content['application/json'].schema).toEqual({ type: 'object' })
		})

		it('does not add request body when no body parameter exists', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/users', parameters: [] })]
				})
			)

			expect(doc.paths['/users']!.get!.requestBody).toBeUndefined()
		})
	})

	describe('responses', () => {
		it('returns generic 200 when no return type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/test', returns: undefined })]
				})
			)

			const responses = doc.paths['/test']!.get!.responses
			expect(responses['200']).toEqual({ description: 'Successful response' })
		})

		it('resolves primitive return type (string)', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/test', returns: 'string' })]
				})
			)

			const resp = (doc.paths['/test']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({ type: 'string' })
		})

		it('resolves number return type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/test', returns: 'number' })]
				})
			)

			const resp = (doc.paths['/test']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({ type: 'number' })
		})

		it('resolves boolean return type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/test', returns: 'boolean' })]
				})
			)

			const resp = (doc.paths['/test']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({ type: 'boolean' })
		})

		it('unwraps Promise<T> and resolves inner type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/test', returns: 'Promise<string>' })]
				})
			)

			const resp = (doc.paths['/test']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({ type: 'string' })
		})

		it('resolves $ref for known schema return type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/users/:id', returns: 'User' })],
					schemas: [userSchema]
				})
			)

			const resp = (doc.paths['/users/{id}']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({ $ref: '#/components/schemas/User' })
		})

		it('resolves array of $ref for T[] return type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/users', returns: 'User[]' })],
					schemas: [userSchema]
				})
			)

			const resp = (doc.paths['/users']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({
				type: 'array',
				items: { $ref: '#/components/schemas/User' }
			})
		})

		it('resolves array of primitives (string[])', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/tags', returns: 'string[]' })]
				})
			)

			const resp = (doc.paths['/tags']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({ type: 'array', items: { type: 'string' } })
		})

		it('resolves Promise<User[]> through both wrappers', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/users', returns: 'Promise<User[]>' })],
					schemas: [userSchema]
				})
			)

			const resp = (doc.paths['/users']!.get!.responses['200'] as any).content['application/json'].schema
			expect(resp).toEqual({
				type: 'array',
				items: { $ref: '#/components/schemas/User' }
			})
		})

		it('returns generic 200 for void/any/unknown return types', () => {
			for (const returnType of ['void', 'any', 'unknown']) {
				const doc = fromArtifactSync(
					makeArtifact({
						routes: [makeRoute({ fullPath: '/test', returns: returnType })]
					})
				)

				const resp = doc.paths['/test']!.get!.responses['200']
				expect((resp as any).content).toBeUndefined()
			}
		})

		it('returns generic 200 for unknown schema type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [makeRoute({ fullPath: '/test', returns: 'UnknownType' })]
				})
			)

			const resp = doc.paths['/test']!.get!.responses['200']
			expect((resp as any).content).toBeUndefined()
		})
	})

	describe('extractBaseTypeName (via request body)', () => {
		it('unwraps Promise<T> in body type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/users',
							method: 'POST',
							parameters: [{ name: 'dto', type: 'Promise<CreateUserDto>', decoratorType: 'body' }]
						})
					],
					schemas: [createDtoSchema]
				})
			)

			const body = doc.paths['/users']!.post!.requestBody as any
			expect(body.content['application/json'].schema).toEqual({
				$ref: '#/components/schemas/CreateUserDto'
			})
		})

		it('unwraps array notation in body type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/users',
							method: 'POST',
							parameters: [{ name: 'dto', type: 'CreateUserDto[]', decoratorType: 'body' }]
						})
					],
					schemas: [createDtoSchema]
				})
			)

			const body = doc.paths['/users']!.post!.requestBody as any
			expect(body.content['application/json'].schema).toEqual({
				$ref: '#/components/schemas/CreateUserDto'
			})
		})

		it('returns generic object for primitive body type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/test',
							method: 'POST',
							parameters: [{ name: 'data', type: 'string', decoratorType: 'body' }]
						})
					]
				})
			)

			const body = doc.paths['/test']!.post!.requestBody as any
			expect(body.content['application/json'].schema).toEqual({ type: 'object' })
		})

		it('returns generic object for empty type', () => {
			const doc = fromArtifactSync(
				makeArtifact({
					routes: [
						makeRoute({
							fullPath: '/test',
							method: 'POST',
							parameters: [{ name: 'data', type: '', decoratorType: 'body' }]
						})
					]
				})
			)

			const body = doc.paths['/test']!.post!.requestBody as any
			expect(body.content['application/json'].schema).toEqual({ type: 'object' })
		})
	})
})
