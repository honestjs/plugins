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

		it('throws when a hook entry is not a function', () => {
			expect(
				() =>
					new RPCPlugin({
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated'),
						hooks: {
							preAnalysisFilters: ['invalid' as any]
						}
					})
			).toThrow(/preAnalysisFilters entries must be functions/)
		})

		it('throws when generator does not support current plugin API version', () => {
			const incompatibleGenerator: RPCGenerator = {
				name: 'legacy-generator',
				supportedApiVersions: ['0'],
				generate: vi.fn(async () => ({
					generator: 'legacy-generator',
					generatedAt: new Date().toISOString(),
					outputFiles: []
				}))
			}

			expect(
				() =>
					new RPCPlugin({
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated'),
						generators: [incompatibleGenerator]
					})
			).toThrow(/does not support RPC plugin API version 1/)
		})

		it('throws when generator requires unsupported capability', () => {
			const incompatibleGenerator: RPCGenerator = {
				name: 'strict-generator',
				requiredCapabilities: ['routes', 'schemas', 'unknown-capability' as any],
				generate: vi.fn(async () => ({
					generator: 'strict-generator',
					generatedAt: new Date().toISOString(),
					outputFiles: []
				}))
			}

			expect(
				() =>
					new RPCPlugin({
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated'),
						generators: [incompatibleGenerator]
					})
			).toThrow(/requires unsupported capability "unknown-capability"/)
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
				artifactVersion: '1',
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
				artifactVersion: '1',
				routes: [{ fullPath: '/users' }],
				schemas: [{ type: 'UserDto', schema: { type: 'object' } }]
			})
		})
	})

	describe('generators', () => {
		it('runs only explicitly provided generators through analyze pipeline', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-custom-generator-'))
			tempDirs.push(outputDir)
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
				outputDir,
				generateOnInit: false,
				generators: [customGenerator]
			})

			await plugin.analyze({ force: true, dryRun: false })

			const results = plugin.getGenerationInfos()

			expect(generate).toHaveBeenCalledTimes(1)
			expect(generate).toHaveBeenCalledWith(
				expect.objectContaining({
					pluginApiVersion: '1',
					pluginCapabilities: expect.arrayContaining(['routes', 'schemas'])
				})
			)
			expect(results).toHaveLength(1)
			expect(results[0]?.generator).toBe('custom-generator')
		})

		it('uses TypeScript generator by default through analyze pipeline', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true, dryRun: false })
			const results = plugin.getGenerationInfos()

			expect(results).toHaveLength(1)
			expect(results[0]?.generator).toBe('typescript-client')
			expect(fs.existsSync(path.join(outputDir, 'client.ts'))).toBe(true)
		})
	})

	describe('analyze options', () => {
		it('supports dryRun without generating client files', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-dry-run-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true, dryRun: true })
			expect(fs.existsSync(path.join(outputDir, 'client.ts'))).toBe(false)
			expect(fs.existsSync(path.join(outputDir, 'rpc-diagnostics.json'))).toBe(true)
			expect(plugin.getDiagnostics()?.dryRun).toBe(true)
		})

		it('analyze(true) forces regeneration', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-force-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze(true)
			expect(plugin.getDiagnostics()?.cache).toBe('bypass')
		})

		it('analyze({}) defaults to force=true', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-default-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({})
			expect(plugin.getDiagnostics()?.cache).toBe('bypass')
		})
	})

	describe('accessor methods', () => {
		it('getRoutes returns analyzed routes', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-acc-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			expect(plugin.getRoutes()).toEqual([])

			await plugin.analyze({ force: true, dryRun: true })
			expect(Array.isArray(plugin.getRoutes())).toBe(true)
		})

		it('getSchemas returns analyzed schemas', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-acc-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			expect(plugin.getSchemas()).toEqual([])

			await plugin.analyze({ force: true, dryRun: true })
			expect(Array.isArray(plugin.getSchemas())).toBe(true)
		})

		it('getDiagnostics returns null before analysis', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generateOnInit: false
			})

			expect(plugin.getDiagnostics()).toBeNull()
		})

		it('getDiagnostics returns diagnostic info after analysis', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-diag-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true, dryRun: true })
			const diag = plugin.getDiagnostics()

			expect(diag).not.toBeNull()
			expect(diag!.generatedAt).toBeDefined()
			expect(diag!.mode).toBe('best-effort')
			expect(diag!.dryRun).toBe(true)
			expect(typeof diag!.routesCount).toBe('number')
			expect(typeof diag!.schemasCount).toBe('number')
			expect(Array.isArray(diag!.warnings)).toBe(true)
		})

		it('getGenerationInfo returns null before generation', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generateOnInit: false
			})

			expect(plugin.getGenerationInfo()).toBeNull()
		})

		it('getGenerationInfos returns empty array before generation', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generateOnInit: false
			})

			expect(plugin.getGenerationInfos()).toEqual([])
		})

		it('getGenerationInfo returns info after non-dryRun analysis', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-geninfo-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true, dryRun: false })
			const info = plugin.getGenerationInfo()

			expect(info).not.toBeNull()
			expect(info!.generator).toBe('typescript-client')
		})
	})

	describe('generateOnInit', () => {
		it('does not run analysis when generateOnInit is false', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-noinit-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			const store = new Map<string, unknown>()
			const app = {
				getContext: () => ({
					set: (key: string, value: unknown) => store.set(key, value),
					get: () => undefined
				}),
				getRoutes: () => []
			} as any

			await plugin.afterModulesRegistered(app, {} as any)

			expect(store.has('rpc.artifact')).toBe(false)
			expect(plugin.getDiagnostics()).toBeNull()
		})
	})

	describe('dispose', () => {
		it('can be called safely without prior analysis', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generateOnInit: false
			})

			expect(() => plugin.dispose()).not.toThrow()
		})

		it('can be called multiple times safely', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				generateOnInit: false
			})

			expect(() => {
				plugin.dispose()
				plugin.dispose()
			}).not.toThrow()
		})
	})

	describe('disk artifact round-trip', () => {
		it('writes artifact and diagnostics to disk on analysis', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-disk-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true })

			expect(fs.existsSync(path.join(outputDir, 'rpc-artifact.json'))).toBe(true)
			expect(fs.existsSync(path.join(outputDir, 'rpc-diagnostics.json'))).toBe(true)

			const artifact = JSON.parse(fs.readFileSync(path.join(outputDir, 'rpc-artifact.json'), 'utf-8'))
			expect(artifact.artifactVersion).toBe('1')
			expect(Array.isArray(artifact.routes)).toBe(true)
			expect(Array.isArray(artifact.schemas)).toBe(true)
		})

		it('writes checksum file after generation', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-checksum-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true })

			expect(fs.existsSync(path.join(outputDir, '.rpc-checksum'))).toBe(true)
		})

		it('does not write artifact or checksum on dryRun', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-dryrun-disk-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true, dryRun: true })

			expect(fs.existsSync(path.join(outputDir, 'rpc-artifact.json'))).toBe(false)
			expect(fs.existsSync(path.join(outputDir, '.rpc-checksum'))).toBe(false)
			expect(fs.existsSync(path.join(outputDir, 'rpc-diagnostics.json'))).toBe(true)
		})
	})

	describe('caching behavior', () => {
		it('reports cache miss on first analysis with force=false', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-cache-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: false })
			expect(plugin.getDiagnostics()?.cache).toBe('miss')
		})

		it('reports cache hit on second analysis when nothing changed', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-cache-hit-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: false })
			expect(plugin.getDiagnostics()?.cache).toBe('miss')

			await plugin.analyze({ force: false })
			expect(plugin.getDiagnostics()?.cache).toBe('hit')
		})

		it('reports cache bypass when force=true', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-cache-bypass-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await plugin.analyze({ force: true })
			expect(plugin.getDiagnostics()?.cache).toBe('bypass')
		})
	})

	describe('analysis queue', () => {
		it('serializes concurrent analyze calls without throwing', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-queue-'))
			tempDirs.push(outputDir)
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false
			})

			await Promise.all([
				plugin.analyze({ force: true, dryRun: true }),
				plugin.analyze({ force: true, dryRun: true }),
				plugin.analyze({ force: true, dryRun: true })
			])

			expect(plugin.getDiagnostics()).not.toBeNull()
			expect(plugin.getDiagnostics()?.dryRun).toBe(true)
		})
	})

	describe('hooks', () => {
		it('runs lifecycle hooks during analyze', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-hooks-'))
			tempDirs.push(outputDir)

			const preAnalysisFilter = vi.fn(async (routes) => routes)
			const postAnalysisTransform = vi.fn(async (state) => state)
			const preEmitValidator = vi.fn(async () => undefined)
			const postEmitReporter = vi.fn(async () => undefined)

			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false,
				hooks: {
					preAnalysisFilters: [preAnalysisFilter],
					postAnalysisTransforms: [postAnalysisTransform],
					preEmitValidators: [preEmitValidator],
					postEmitReporters: [postEmitReporter]
				}
			})

			await plugin.analyze({ force: true, dryRun: true })

			expect(preAnalysisFilter).toHaveBeenCalledTimes(1)
			expect(postAnalysisTransform).toHaveBeenCalledTimes(1)
			expect(preEmitValidator).toHaveBeenCalledTimes(1)
			expect(postEmitReporter).toHaveBeenCalledTimes(1)
		})

		it('allows postAnalysisTransform to mutate warnings and routes used in diagnostics', async () => {
			const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-plugin-hooks-transform-'))
			tempDirs.push(outputDir)

			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir,
				generateOnInit: false,
				hooks: {
					postAnalysisTransforms: [
						async (state) => ({
							...state,
							routes: [
								{
									controller: 'SyntheticController',
									handler: 'synthetic',
									method: 'GET',
									prefix: '',
									route: '/synthetic',
									path: '/synthetic',
									fullPath: '/synthetic'
								}
							],
							warnings: [...state.warnings, 'synthetic warning']
						})
					]
				}
			})

			await plugin.analyze({ force: true, dryRun: true })

			expect(plugin.getRoutes()).toHaveLength(1)
			expect(plugin.getDiagnostics()?.warnings).toContain('synthetic warning')
		})
	})

	describe('mode configuration', () => {
		it('defaults to best-effort mode', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated')
			})

			expect((plugin as any).mode).toBe('best-effort')
		})

		it('accepts strict mode', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				mode: 'strict'
			})

			expect((plugin as any).mode).toBe('strict')
		})

		it('sets failOnSchemaError=true in strict mode by default', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				mode: 'strict'
			})

			expect((plugin as any).failOnSchemaError).toBe(true)
		})

		it('sets failOnRouteAnalysisWarning=true in strict mode by default', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				mode: 'strict'
			})

			expect((plugin as any).failOnRouteAnalysisWarning).toBe(true)
		})

		it('allows overriding failOnSchemaError in strict mode', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				mode: 'strict',
				failOnSchemaError: false
			})

			expect((plugin as any).failOnSchemaError).toBe(false)
		})
	})

	describe('logLevel configuration', () => {
		it('defaults to info logLevel', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated')
			})

			expect((plugin as any).logLevel).toBe('info')
		})

		it('accepts silent logLevel', () => {
			const plugin = new RPCPlugin({
				tsConfigPath: validTsConfigPath,
				outputDir: path.join(__dirname, '..', 'generated'),
				logLevel: 'silent'
			})

			expect((plugin as any).logLevel).toBe('silent')
		})
	})
})
