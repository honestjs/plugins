import { describe, expect, it } from 'vitest'
import { buildFullApiPath, buildFullPath } from './path-utils'

describe('path-utils', () => {
	describe('buildFullPath', () => {
		it('returns / for empty basePath', () => {
			expect(buildFullPath('', [])).toBe('/')
		})

		it('returns / for invalid basePath', () => {
			expect(buildFullPath(null as unknown as string, [])).toBe('/')
			expect(buildFullPath(undefined as unknown as string, [])).toBe('/')
		})

		it('returns base path with no params', () => {
			expect(buildFullPath('/users', [])).toBe('/users')
			expect(buildFullPath('/api/v1', [])).toBe('/api/v1')
		})

		it('replaces :param placeholder when param has data ":id"', () => {
			const params = [
				{ data: ':id', index: 0, name: 'param', factory: () => null }
			] as any
			expect(buildFullPath('/users/:id', params)).toBe('/users/${id}')
		})
	})

	describe('buildFullApiPath', () => {
		it('returns / for minimal route', () => {
			expect(
				buildFullApiPath({
					prefix: '',
					version: '',
					route: '',
					path: '',
					method: 'GET',
					fullPath: '/'
				} as any)
			).toBe('/')
		})

		it('returns / when all segments are /', () => {
			expect(
				buildFullApiPath({
					prefix: '/',
					version: '/',
					route: '/',
					path: '/',
					method: 'GET',
					fullPath: '/'
				} as any)
			).toBe('/')
		})

		it('builds path with prefix, version, route and path', () => {
			const route = {
				prefix: '/api',
				version: 'v1',
				route: 'users',
				path: '/:id',
				method: 'GET',
				fullPath: '/api/v1/users/:id'
			} as any
			expect(buildFullApiPath(route)).toBe('/api/v1/users/:id')
		})

		it('ensures result starts with /', () => {
			const route = {
				prefix: 'api',
				version: 'v1',
				route: 'users',
				path: '',
				method: 'GET',
				fullPath: '/api/v1/users'
			} as any
			expect(buildFullApiPath(route)).toMatch(/^\//)
			expect(buildFullApiPath(route)).toBe('/api/v1/users')
		})
	})
})
