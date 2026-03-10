import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RPCPlugin } from './rpc.plugin'
import type { RPCGenerator } from './types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const validTsConfigPath = path.join(__dirname, '..', 'tsconfig.json')
const tempDirs: string[] = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		if (fs.existsSync(dir)) {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	}
})

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

		it('uses default TypeScript generator when generators option is omitted', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated')
			})

			expect((plugin as any).generators).toHaveLength(1)
			expect((plugin as any).generators[0]?.name).toBe('typescript-client')
		})

		it('uses only explicitly provided generators when generators array is defined', () => {
			const customGenerator: RPCGenerator = {
				name: 'custom-generator',
				generate: vi.fn(async () => ({
					generator: 'custom-generator',
					generatedAt: new Date().toISOString(),
					outputFiles: []
				}))
			}
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generators: [customGenerator]
			})

			expect((plugin as any).generators).toHaveLength(1)
			expect((plugin as any).generators[0]?.name).toBe('custom-generator')
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

	describe('generators', () => {
		it('runs only explicitly provided generators', async () => {
			const generate = vi.fn(async () => ({
				generator: 'custom-generator',
				generatedAt: new Date().toISOString(),
				outputFiles: []
			}))
			const customGenerator: RPCGenerator = {
				name: 'custom-generator',
				generate
			}
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generators: [customGenerator]
			})

			;(plugin as any).analyzedRoutes = []
			;(plugin as any).analyzedSchemas = []
			const results = await (plugin as any).runGenerators()

			expect(generate).toHaveBeenCalledTimes(1)
			expect(results).toHaveLength(1)
			expect(results[0]?.generator).toBe('custom-generator')
		})

		it('uses TypeScript generator by default when generators are not provided', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir
			})

			;(plugin as any).analyzedRoutes = []
			;(plugin as any).analyzedSchemas = []
			const results = await (plugin as any).runGenerators()

			expect(results).toHaveLength(1)
			expect(results[0]?.generator).toBe('typescript-client')
			expect(fs.existsSync(path.join(outputDir, 'client.ts'))).toBe(true)
		})
	})
})
