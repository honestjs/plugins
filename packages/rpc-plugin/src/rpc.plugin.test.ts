import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it, vi } from 'vitest'
import { RPCPlugin } from './rpc.plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const validTsConfigPath = path.join(__dirname, '..', 'tsconfig.json')

describe('RPCPlugin', () => {
	describe('constructor', () => {
		it('throws when controllerPattern is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: '',
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).toThrow(/Configuration validation failed.*Controller pattern cannot be empty/)
		})

		it('throws when tsConfigPath is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: '',
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).toThrow(/Configuration validation failed.*TypeScript config path cannot be empty/)
		})

		it('throws when tsconfig file does not exist', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: '/nonexistent/tsconfig.json',
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).toThrow(/TypeScript config file not found/)
		})

		it('throws when outputDir is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: validTsConfigPath,
						outputDir: ''
					})
			).toThrow(/Configuration validation failed.*Output directory cannot be empty/)
		})

		it('throws when context namespace is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated'),
						context: {
							namespace: ''
						}
					})
			).toThrow(/Configuration validation failed.*Context namespace cannot be empty/)
		})

		it('throws when context artifact key is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated'),
						context: {
							keys: {
								artifact: ''
							}
						}
					})
			).toThrow(/Configuration validation failed.*Context artifact key cannot be empty/)
		})

		it('does not throw with valid default options', () => {
			expect(
				() =>
					new RPCPlugin({
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).not.toThrow()
		})
	})

	describe('context artifact publishing', () => {
		it('writes artifact to default rpc.artifact key', async () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated')
			})

			;(plugin as any).analyzeEverything = vi.fn(async () => {
				;(plugin as any).analyzedRoutes = [{ fullPath: '/health' }]
				;(plugin as any).analyzedSchemas = [{ type: 'HealthDto', schema: { type: 'object' } }]
			})

			const store = new Map<string, unknown>()
			const app = {
				getContext: () => ({
					set: (key: string, value: unknown) => {
						store.set(key, value)
					}
				})
			} as any

			await plugin.afterModulesRegistered(app, {} as any)

			expect(store.has('rpc.artifact')).toBe(true)
			expect(store.get('rpc.artifact')).toEqual({
				routes: [{ fullPath: '/health' }],
				schemas: [{ type: 'HealthDto', schema: { type: 'object' } }]
			})
		})

		it('writes artifact to custom context namespace and key', async () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				context: {
					namespace: 'custom',
					keys: {
						artifact: 'routes'
					}
				}
			})

			;(plugin as any).analyzeEverything = vi.fn(async () => {
				;(plugin as any).analyzedRoutes = [{ fullPath: '/users' }]
				;(plugin as any).analyzedSchemas = [{ type: 'UserDto', schema: { type: 'object' } }]
			})

			const store = new Map<string, unknown>()
			const app = {
				getContext: () => ({
					set: (key: string, value: unknown) => {
						store.set(key, value)
					}
				})
			} as any

			await plugin.afterModulesRegistered(app, {} as any)

			expect(store.has('custom.routes')).toBe(true)
			expect(store.get('custom.routes')).toEqual({
				routes: [{ fullPath: '/users' }],
				schemas: [{ type: 'UserDto', schema: { type: 'object' } }]
			})
		})
	})
})
