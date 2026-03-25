import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { TypeScriptClientGenerator } from './typescript-client.generator'
import type { ExtendedRouteInfo } from '../types/route.types'
import type { SchemaInfo } from '../types/schema.types'

async function loadGeneratedClientModule(clientPath: string): Promise<any> {
	const source = fs.readFileSync(clientPath, 'utf-8')
	const transpiled = transpileModule(source, {
		compilerOptions: {
			module: ModuleKind.ESNext,
			target: ScriptTarget.ES2022
		}
	}).outputText

	return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled)}`)
}

const mockRoute: ExtendedRouteInfo = {
	method: 'GET',
	path: '/:id',
	prefix: '/api',
	version: 'v1',
	route: 'users',
	fullPath: '/api/v1/users/:id',
	handler: 'getById',
	controller: 'UsersController',
	parameters: [
		{
			index: 0,
			name: 'id',
			decoratorType: 'param',
			type: 'string',
			required: true,
			data: 'id',
			factory: () => null
		}
	],
	returns: 'User'
}

const mockSchema: SchemaInfo = {
	type: 'User',
	schema: {
		definitions: {
			User: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					name: { type: 'string' }
				}
			}
		}
	}
}

describe('TypeScriptClientGenerator', () => {
	let outputDir: string

	afterEach(() => {
		if (outputDir && fs.existsSync(outputDir)) {
			fs.rmSync(outputDir, { recursive: true })
		}
	})

	it('returns correct shape with clientFile and generatedAt', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new TypeScriptClientGenerator(outputDir)

		const result = await service.generateClient([mockRoute], [mockSchema])

		expect(result).toHaveProperty('clientFile')
		expect(result.clientFile).toMatch(/client\.ts$/)
		expect(result.generator).toBe('typescript-client')
		expect(result).toHaveProperty('generatedAt')
		expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
	})

	it('writes client file to outputDir', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new TypeScriptClientGenerator(outputDir)

		const result = await service.generateClient([mockRoute], [mockSchema])

		expect(result.clientFile).toBeDefined()
		const clientFile = result.clientFile as string
		expect(fs.existsSync(clientFile)).toBe(true)
		expect(clientFile).toBe(path.join(outputDir, 'client.ts'))
	})

	it('generated content includes ApiError and RequestOptions', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new TypeScriptClientGenerator(outputDir)

		await service.generateClient([mockRoute], [mockSchema])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('export class ApiError')
		expect(content).toContain('RequestOptions')
	})

	it('generated content includes route path and handler', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new TypeScriptClientGenerator(outputDir)

		await service.generateClient([mockRoute], [mockSchema])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('/api/v1/users/:id')
		expect(content).toContain('getById')
	})

	it('generate() interface method delegates to generateClient', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)

		const result = await generator.generate({
			outputDir,
			routes: [mockRoute],
			schemas: [mockSchema],
			pluginApiVersion: '1',
			pluginCapabilities: ['routes', 'schemas']
		})

		expect(result.generator).toBe('typescript-client')
		expect(result.clientFile).toBeDefined()
		expect(fs.existsSync(result.clientFile as string)).toBe(true)
	})

	it('groups routes by controller into getter methods', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const routes: ExtendedRouteInfo[] = [
			{ ...mockRoute, controller: 'UsersController', handler: 'findAll', fullPath: '/users' },
			{ ...mockRoute, controller: 'PostsController', handler: 'list', fullPath: '/posts' }
		]
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient(routes, [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('get users()')
		expect(content).toContain('get posts()')
		expect(content).toContain('findAll')
		expect(content).toContain('list')
	})

	it('generates empty client for no routes', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)

		const result = await generator.generateClient([], [])

		expect(result.clientFile).toBeDefined()
		const content = fs.readFileSync(result.clientFile as string, 'utf-8')
		expect(content).toContain('export class ApiClient')
		expect(content).toContain('No schemas available')
	})

	it('includes schema type interfaces when schemas provided', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const schemas: SchemaInfo[] = [
			{
				type: 'UserDto',
				schema: {
					definitions: {
						UserDto: {
							properties: { id: { type: 'string' } },
							required: ['id']
						}
					}
				},
				typescriptType: 'export interface UserDto {\n  id: string\n}'
			}
		]
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([], schemas)

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('export interface UserDto')
	})

	it('insure deduplicated interfaces and types', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const schemas: SchemaInfo[] = [
			{
				type: 'UserRole',
				schema: {
					definitions: {
						UserRole: {
							type: 'string',
							enum: ['user', 'admin']
						}
					}
				},
				typescriptType: "export type UserRole = 'user' | 'admin'"
			},
			{
				type: 'UserDto',
				schema: {
					definitions: {
						UserDto: {
							properties: {
								id: { type: 'string' },
								role: { $ref: '#/definitions/UserRole' }
							},
							required: ['id']
						},
						UserRole: {
							type: 'string',
							enum: ['user', 'admin']
						}
					}
				},
				typescriptType:
					"export interface UserDto {\n  id: string\n  role: UserRole\n}\n\nexport type UserRole = 'user' | 'admin'"
			},
			{
				type: 'UserDto',
				schema: {
					definitions: {
						UserDto: {
							properties: { id: { type: 'string' } },
							required: ['id']
						}
					}
				},
				typescriptType: 'export interface UserDto {\n  id: string\n}'
			}
		]
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([], schemas)

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')

		expect(content.match(/export interface UserDto {/g)).toHaveLength(1)
		expect(content.match(/export type UserRole =/g)).toHaveLength(1)
	})

	it('handles routes with query parameters', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const route: ExtendedRouteInfo = {
			...mockRoute,
			handler: 'search',
			fullPath: '/users/search',
			parameters: [
				{
					index: 0,
					name: 'q',
					decoratorType: 'query',
					type: 'string',
					required: true,
					data: 'q',
					factory: () => null
				}
			]
		}
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([route], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('search')
		expect(content).toContain('q: string')
	})

	it('handles routes with body parameters', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const route: ExtendedRouteInfo = {
			...mockRoute,
			method: 'POST',
			handler: 'create',
			fullPath: '/users',
			parameters: [
				{
					index: 0,
					name: 'dto',
					decoratorType: 'body',
					type: 'CreateUserDto',
					required: true,
					factory: () => null
				}
			]
		}
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([route], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('create')
		expect(content).toContain('POST')
	})

	it('extracts inner type from Promise<T> returns', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const route: ExtendedRouteInfo = {
			...mockRoute,
			handler: 'findAll',
			fullPath: '/users',
			returns: 'Promise<User[]>',
			parameters: []
		}
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([route], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('User[]')
		expect(content).not.toContain('Promise<User[]>')
	})

	it('uses "any" as return type when returns is undefined', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const route: ExtendedRouteInfo = {
			...mockRoute,
			handler: 'doSomething',
			fullPath: '/do',
			returns: undefined,
			parameters: []
		}
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([route], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toMatch(/Result\s*=\s*any/)
	})

	it('strips TypedResponse from return type so client stays self-contained', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const route: ExtendedRouteInfo = {
			...mockRoute,
			handler: 'redirect',
			fullPath: '/redirect',
			returns: 'Response & TypedResponse<undefined, 302, "redirect">',
			parameters: []
		}
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([route], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toMatch(/Result\s*=\s*Response\b/)
		expect(content).not.toContain('TypedResponse')
	})

	it('includes FetchFunction type in output', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('export type FetchFunction')
	})

	it('includes request and response interceptor types in output', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('export type RequestInterceptor')
		expect(content).toContain('export type ResponseInterceptor')
	})

	it('wires interceptor options and runtime methods into ApiClient', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient([], [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('requestInterceptors?: readonly RequestInterceptor[]')
		expect(content).toContain('responseInterceptors?: readonly ResponseInterceptor[]')
		expect(content).toContain('addRequestInterceptor(interceptor: RequestInterceptor): this')
		expect(content).toContain('addResponseInterceptor(interceptor: ResponseInterceptor): this')
		expect(content).toContain('applyRequestInterceptors(url: string, init: RequestInit)')
		expect(content).toContain('applyResponseInterceptors(response: Response)')
	})

	it('generates multiple routes under the same controller getter', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const routes: ExtendedRouteInfo[] = [
			{
				...mockRoute,
				controller: 'UsersController',
				handler: 'findAll',
				fullPath: '/users',
				method: 'GET',
				parameters: []
			},
			{
				...mockRoute,
				controller: 'UsersController',
				handler: 'create',
				fullPath: '/users',
				method: 'POST',
				parameters: []
			},
			{ ...mockRoute, controller: 'UsersController', handler: 'findOne', fullPath: '/users/:id', method: 'GET' }
		]
		const generator = new TypeScriptClientGenerator(outputDir)

		await generator.generateClient(routes, [])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		const usersGetterCount = (content.match(/get users\(\)/g) || []).length
		expect(usersGetterCount).toBe(1)
		expect(content).toContain('findAll')
		expect(content).toContain('create')
		expect(content).toContain('findOne')
	})

	it('creates output directory if it does not exist', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const nestedDir = path.join(outputDir, 'nested', 'deep')
		const generator = new TypeScriptClientGenerator(nestedDir)

		await generator.generateClient([mockRoute], [mockSchema])

		expect(fs.existsSync(path.join(nestedDir, 'client.ts'))).toBe(true)
	})

	it('executes request and response interceptors at runtime', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)
		const route: ExtendedRouteInfo = {
			...mockRoute,
			controller: 'TestController',
			handler: 'ping',
			method: 'GET',
			fullPath: '/ping',
			parameters: [],
			returns: '{ ok: boolean }'
		}

		const generated = await generator.generateClient([route], [])
		const mod = await loadGeneratedClientModule(generated.clientFile as string)
		const ApiClient = mod.ApiClient as any

		let calledUrl = ''
		let calledHeaders: Record<string, string> = {}
		const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			calledUrl = String(input)
			calledHeaders = (init?.headers || {}) as Record<string, string>
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		}

		const client = new ApiClient('https://api.example.com', {
			fetchFn,
			requestInterceptors: [
				(url: string, init: RequestInit) => ({
					url: `${url}?intercepted=1`,
					init: {
						...init,
						headers: {
							...(init.headers as Record<string, string>),
							'X-Test-Interceptor': 'yes'
						}
					}
				})
			],
			responseInterceptors: [
				() =>
					new Response(JSON.stringify({ ok: true, intercepted: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
			]
		})

		const result = await client.test.ping()

		expect(calledUrl).toContain('/ping?intercepted=1')
		expect(calledHeaders['X-Test-Interceptor']).toBe('yes')
		expect(result).toEqual({ ok: true, intercepted: true })
	})

	it('throws ApiError with message from json error response', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const generator = new TypeScriptClientGenerator(outputDir)
		const route: ExtendedRouteInfo = {
			...mockRoute,
			controller: 'TestController',
			handler: 'fail',
			method: 'GET',
			fullPath: '/fail',
			parameters: [],
			returns: 'void'
		}

		const generated = await generator.generateClient([route], [])
		const mod = await loadGeneratedClientModule(generated.clientFile as string)
		const ApiClient = mod.ApiClient as any
		const ApiError = mod.ApiError as any

		const fetchFn = async (): Promise<Response> =>
			new Response(JSON.stringify({ message: 'boom' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			})

		const client = new ApiClient('https://api.example.com', { fetchFn })

		await expect(client.test.fail()).rejects.toBeInstanceOf(ApiError)
		await expect(client.test.fail()).rejects.toMatchObject({ statusCode: 400, message: 'boom' })
	})
})
