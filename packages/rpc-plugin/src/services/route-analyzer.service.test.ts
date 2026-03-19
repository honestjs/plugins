import { Project } from 'ts-morph'
import { describe, expect, it, vi } from 'vitest'
import type { RouteInfo, ParameterMetadata } from 'honestjs'
import { RouteAnalyzerService } from './route-analyzer.service'

function createProject(sources: Record<string, string>): Project {
	const project = new Project({ useInMemoryFileSystem: true })
	for (const [name, content] of Object.entries(sources)) {
		project.createSourceFile(name, content)
	}
	return project
}

function makeRoute(overrides: Partial<RouteInfo> = {}): RouteInfo {
	return {
		controller: 'TestController',
		handler: 'index',
		method: 'get',
		prefix: '',
		route: '/test',
		path: '/',
		fullPath: '/test',
		parameters: [],
		...overrides
	}
}

const controllerSource = `
import { Controller, Get, Post } from 'honestjs'

@Controller('/users')
class UsersController {
	@Get('/')
	findAll(): Promise<User[]> {
		return [] as any
	}

	@Get('/:id')
	findOne(id: string): User {
		return {} as any
	}

	@Post('/')
	create(dto: CreateUserDto): User {
		return {} as any
	}
}

interface User {
	id: string
	name: string
}

interface CreateUserDto {
	name: string
	email: string
}
`

const viewSource = `
import { View, Get } from 'honestjs'

@View('/home')
class HomeView {
	@Get('/')
	index(): string {
		return 'home'
	}
}
`

describe('RouteAnalyzerService', () => {
	describe('analyzeControllerMethods', () => {
		it('returns empty array when no routes provided', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const result = await service.analyzeControllerMethods(project, [])
			expect(result).toEqual([])
		})

		it('returns empty array when routes is null-ish', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const result = await service.analyzeControllerMethods(project, null as any)
			expect(result).toEqual([])
		})

		it('returns extended routes for matched controllers', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const routes: RouteInfo[] = [
				makeRoute({
					controller: 'UsersController',
					handler: 'findAll',
					method: 'get',
					route: '/users',
					path: '/',
					fullPath: '/users'
				})
			]

			const result = await service.analyzeControllerMethods(project, routes)
			expect(result).toHaveLength(1)
			expect(result[0].controller).toBe('UsersController')
			expect(result[0].handler).toBe('findAll')
			expect(result[0].method).toBe('GET')
			expect(result[0].returns).toBeDefined()
		})

		it('extracts return type from handler method', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const routes: RouteInfo[] = [
				makeRoute({
					controller: 'UsersController',
					handler: 'findOne',
					method: 'get',
					fullPath: '/users/:id'
				})
			]

			const result = await service.analyzeControllerMethods(project, routes)
			expect(result[0].returns).toBe('User')
		})

		it('extracts parameters with types when metadata provided', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const paramMeta: ParameterMetadata[] = [{ index: 0, name: 'param', data: ':id', factory: () => null }]
			const routes: RouteInfo[] = [
				makeRoute({
					controller: 'UsersController',
					handler: 'findOne',
					method: 'get',
					fullPath: '/users/:id',
					parameters: paramMeta
				})
			]

			const result = await service.analyzeControllerMethods(project, routes)
			expect(result[0].parameters).toBeDefined()
			expect(result[0].parameters).toHaveLength(1)
			expect(result[0].parameters![0].decoratorType).toBe('param')
			expect(result[0].parameters![0].type).toBe('string')
		})

		it('adds warning when controller class not found in source files', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const routes: RouteInfo[] = [makeRoute({ controller: 'NonExistentController', handler: 'index' })]

			const result = await service.analyzeControllerMethods(project, routes)
			expect(result).toHaveLength(1)
			expect(service.getWarnings().length).toBeGreaterThan(0)
			expect(service.getWarnings()[0]).toContain('NonExistentController')
		})

		it('resets warnings on each call', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			await service.analyzeControllerMethods(project, [makeRoute({ controller: 'Missing', handler: 'x' })])
			expect(service.getWarnings().length).toBeGreaterThan(0)

			await service.analyzeControllerMethods(project, [
				makeRoute({ controller: 'UsersController', handler: 'findAll', fullPath: '/users' })
			])
			expect(service.getWarnings()).toHaveLength(0)
		})

		it('calls onWarn callback for warnings', async () => {
			const onWarn = vi.fn()
			const service = new RouteAnalyzerService({ onWarn })
			const project = createProject({ 'controller.ts': controllerSource })

			await service.analyzeControllerMethods(project, [makeRoute({ controller: 'Missing', handler: 'index' })])

			expect(onWarn).toHaveBeenCalled()
			expect(onWarn.mock.calls[0][0]).toContain('Missing')
		})

		it('returns empty when no controller classes found in project', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({
				'plain.ts': 'export class PlainClass { hello() {} }'
			})

			const result = await service.analyzeControllerMethods(project, [
				makeRoute({ controller: 'PlainClass', handler: 'hello' })
			])

			expect(result).toEqual([])
		})
	})

	describe('isControllerClass', () => {
		it('recognizes @Controller decorated classes', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'controller.ts': controllerSource })

			const routes: RouteInfo[] = [
				makeRoute({ controller: 'UsersController', handler: 'findAll', fullPath: '/users' })
			]
			const result = await service.analyzeControllerMethods(project, routes)
			expect(result).toHaveLength(1)
		})

		it('recognizes @View decorated classes', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({ 'view.ts': viewSource })

			const routes: RouteInfo[] = [makeRoute({ controller: 'HomeView', handler: 'index', fullPath: '/home' })]
			const result = await service.analyzeControllerMethods(project, routes)
			expect(result).toHaveLength(1)
		})

		it('uses customClassMatcher when provided', async () => {
			const customMatcher = vi.fn((cls: any) => cls.getName()?.endsWith('Service') ?? false)
			const service = new RouteAnalyzerService({ customClassMatcher: customMatcher })
			const project = createProject({
				'service.ts': `
					class UserService {
						findAll(): string[] { return [] }
					}
				`
			})

			const routes: RouteInfo[] = [
				makeRoute({ controller: 'UserService', handler: 'findAll', fullPath: '/users' })
			]
			const result = await service.analyzeControllerMethods(project, routes)
			expect(result).toHaveLength(1)
			expect(customMatcher).toHaveBeenCalled()
		})
	})

	describe('getParametersWithTypes', () => {
		it('handles parameter index beyond declared params', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({
				'controller.ts': `
					@Controller('/')
					class TestController {
						handler(a: string) {}
					}
				`
			})

			const paramMeta: ParameterMetadata[] = [
				{ index: 0, name: 'param', data: ':a', factory: () => null },
				{ index: 5, name: 'query', data: 'extra', factory: () => null }
			]
			const routes: RouteInfo[] = [
				makeRoute({
					controller: 'TestController',
					handler: 'handler',
					parameters: paramMeta
				})
			]

			const result = await service.analyzeControllerMethods(project, routes)
			expect(result[0].parameters).toHaveLength(2)
			expect(result[0].parameters![1].name).toBe('param5')
			expect(result[0].parameters![1].type).toBe('unknown')
		})

		it('sorts parameters by index', async () => {
			const service = new RouteAnalyzerService()
			const project = createProject({
				'controller.ts': `
					@Controller('/')
					class TestController {
						handler(a: string, b: number) {}
					}
				`
			})

			const paramMeta: ParameterMetadata[] = [
				{ index: 1, name: 'query', data: 'b', factory: () => null },
				{ index: 0, name: 'param', data: ':a', factory: () => null }
			]
			const routes: RouteInfo[] = [
				makeRoute({
					controller: 'TestController',
					handler: 'handler',
					parameters: paramMeta
				})
			]

			const result = await service.analyzeControllerMethods(project, routes)
			expect(result[0].parameters![0].index).toBe(0)
			expect(result[0].parameters![1].index).toBe(1)
		})
	})
})
