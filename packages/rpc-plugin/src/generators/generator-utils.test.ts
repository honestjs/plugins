import { describe, expect, it } from 'vitest'
import { groupRoutesByController } from './generator-utils'
import type { ExtendedRouteInfo } from '../types/route.types'

function makeRoute(overrides: Partial<ExtendedRouteInfo> = {}): ExtendedRouteInfo {
	return {
		method: 'GET',
		handler: 'index',
		controller: 'TestController',
		fullPath: '/test',
		prefix: '',
		route: '/test',
		path: '/',
		...overrides
	}
}

describe('generator-utils', () => {
	describe('groupRoutesByController', () => {
		it('returns empty map for empty routes', () => {
			const result = groupRoutesByController([])
			expect(result.size).toBe(0)
		})

		it('groups routes by controller name', () => {
			const routes = [
				makeRoute({ controller: 'UsersController', handler: 'findAll' }),
				makeRoute({ controller: 'UsersController', handler: 'findOne' }),
				makeRoute({ controller: 'PostsController', handler: 'list' })
			]

			const result = groupRoutesByController(routes)
			expect(result.size).toBe(2)
			expect(result.get('UsersController')).toHaveLength(2)
			expect(result.get('PostsController')).toHaveLength(1)
		})

		it('preserves route order within each group', () => {
			const routes = [
				makeRoute({ controller: 'TestController', handler: 'first' }),
				makeRoute({ controller: 'TestController', handler: 'second' }),
				makeRoute({ controller: 'TestController', handler: 'third' })
			]

			const result = groupRoutesByController(routes)
			const group = result.get('TestController')!
			expect(group[0].handler).toBe('first')
			expect(group[1].handler).toBe('second')
			expect(group[2].handler).toBe('third')
		})

		it('handles symbol controller names via safeToString', () => {
			const routes = [
				makeRoute({ controller: Symbol('MyController') as any, handler: 'index' })
			]

			const result = groupRoutesByController(routes)
			expect(result.size).toBe(1)
			expect(result.has('MyController')).toBe(true)
		})

		it('handles single route', () => {
			const routes = [makeRoute({ controller: 'Solo', handler: 'only' })]

			const result = groupRoutesByController(routes)
			expect(result.size).toBe(1)
			expect(result.get('Solo')).toHaveLength(1)
		})
	})
})
