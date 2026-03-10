import fs from 'fs'
import type { Application, IPlugin } from 'honestjs'
import type { Hono } from 'hono'
import path from 'path'
import { Project } from 'ts-morph'

import { DEFAULT_OPTIONS, LOG_PREFIX } from './constants/defaults'
import { TypeScriptClientGenerator } from './generators'
import { computeHash, readChecksum, writeChecksum } from './utils/hash-utils'
import { RouteAnalyzerService } from './services/route-analyzer.service'
import { SchemaGeneratorService } from './services/schema-generator.service'
import type { ExtendedRouteInfo, GeneratedClientInfo, RPCGenerator, SchemaInfo } from './types'

/**
 * Configuration options for the RPCPlugin
 */
export interface RPCPluginOptions {
	readonly controllerPattern?: string
	readonly tsConfigPath?: string
	readonly outputDir?: string
	readonly generateOnInit?: boolean
	readonly generators?: readonly RPCGenerator[]
	readonly context?: {
		readonly namespace?: string
		readonly keys?: {
			readonly artifact?: string
		}
	}
}

/**
 * Comprehensive RPC plugin that combines route analysis, schema generation, and client generation
 */
export class RPCPlugin implements IPlugin {
	private readonly controllerPattern: string
	private readonly tsConfigPath: string
	private readonly outputDir: string
	private readonly generateOnInit: boolean
	private readonly contextNamespace: string
	private readonly contextArtifactKey: string

	// Services
	private readonly routeAnalyzer: RouteAnalyzerService
	private readonly schemaGenerator: SchemaGeneratorService
	private readonly generators: readonly RPCGenerator[]

	// Shared ts-morph project
	private project: Project | null = null

	// Internal state
	private analyzedRoutes: ExtendedRouteInfo[] = []
	private analyzedSchemas: SchemaInfo[] = []
	private generatedInfos: GeneratedClientInfo[] = []
	private app: Application | null = null

	constructor(options: RPCPluginOptions = {}) {
		this.controllerPattern = options.controllerPattern ?? DEFAULT_OPTIONS.controllerPattern
		this.tsConfigPath = options.tsConfigPath ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.tsConfigPath)
		this.outputDir = options.outputDir ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.outputDir)
		this.generateOnInit = options.generateOnInit ?? DEFAULT_OPTIONS.generateOnInit
		this.contextNamespace = options.context?.namespace ?? DEFAULT_OPTIONS.context.namespace
		this.contextArtifactKey = options.context?.keys?.artifact ?? DEFAULT_OPTIONS.context.keys.artifact

		// Initialize services
		this.routeAnalyzer = new RouteAnalyzerService()
		this.schemaGenerator = new SchemaGeneratorService(this.controllerPattern, this.tsConfigPath)
		this.generators = options.generators ?? [new TypeScriptClientGenerator(this.outputDir)]

		this.validateConfiguration()
	}

	/**
	 * Validates the plugin configuration
	 */
	private validateConfiguration(): void {
		const errors: string[] = []

		if (!this.controllerPattern?.trim()) {
			errors.push('Controller pattern cannot be empty')
		}

		if (!this.tsConfigPath?.trim()) {
			errors.push('TypeScript config path cannot be empty')
		} else {
			if (!fs.existsSync(this.tsConfigPath)) {
				errors.push(`TypeScript config file not found at: ${this.tsConfigPath}`)
			}
		}

		if (!this.outputDir?.trim()) {
			errors.push('Output directory cannot be empty')
		}
		if (!this.contextNamespace?.trim()) {
			errors.push('Context namespace cannot be empty')
		}
		if (!this.contextArtifactKey?.trim()) {
			errors.push('Context artifact key cannot be empty')
		}
		for (const generator of this.generators) {
			if (!generator.name?.trim()) {
				errors.push('Generator name cannot be empty')
			}
			if (typeof generator.generate !== 'function') {
				errors.push(`Generator "${generator.name || 'unknown'}" must implement generate(context)`)
			}
		}

		if (errors.length > 0) {
			throw new Error(`Configuration validation failed: ${errors.join(', ')}`)
		}

		this.log(
			`Configuration validated: controllerPattern=${this.controllerPattern}, tsConfigPath=${this.tsConfigPath}, outputDir=${this.outputDir}`
		)
	}

	/**
	 * Called after all modules are registered
	 */
	afterModulesRegistered = async (app: Application, hono: Hono): Promise<void> => {
		this.app = app
		if (this.generateOnInit) {
			await this.analyzeEverything()
			this.publishArtifact(app)
		}
	}

	/**
	 * Main analysis method that coordinates all three components
	 */
	private async analyzeEverything(force = false): Promise<void> {
		try {
			this.log('Starting comprehensive RPC analysis...')

			// Create a single shared ts-morph project for both services
			this.dispose()
			this.project = new Project({ tsConfigFilePath: this.tsConfigPath })
			this.project.addSourceFilesAtPaths([this.controllerPattern])

			// Hash check: skip if controller files are unchanged since last generation
			const filePaths = this.project.getSourceFiles().map((f) => f.getFilePath())

			if (!force) {
				const currentHash = computeHash(filePaths)
				const stored = readChecksum(this.outputDir)

				if (stored && stored.hash === currentHash && this.outputFilesExist()) {
					if (this.loadArtifactFromDisk()) {
						this.log('Source files unchanged — skipping regeneration')
						this.dispose()
						return
					}
					this.log('Source files unchanged but cached artifact missing/invalid — regenerating')
				}
			}

			// Clear previous analysis results to prevent stale state across runs
			this.analyzedRoutes = []
			this.analyzedSchemas = []
			this.generatedInfos = []

			// Step 1: Analyze routes and extract type information
			this.analyzedRoutes = await this.routeAnalyzer.analyzeControllerMethods(this.project)

			// Step 2: Generate schemas from the types we found
			this.analyzedSchemas = await this.schemaGenerator.generateSchemas(this.project)

			// Step 3: Run configured generators
			this.generatedInfos = await this.runGenerators()

			// Write checksum after successful generation
			await writeChecksum(this.outputDir, { hash: computeHash(filePaths), files: filePaths })
			this.writeArtifactToDisk()

			this.log(
				`✅ RPC analysis complete: ${this.analyzedRoutes.length} routes, ${this.analyzedSchemas.length} schemas`
			)
		} catch (error) {
			this.logError('Error during RPC analysis:', error)
			this.dispose()
			throw error
		}
	}

	/**
	 * Manually trigger analysis (useful for testing or re-generation).
	 * Defaults to force=true to bypass cache; pass false to use caching.
	 */
	async analyze(force = true): Promise<void> {
		await this.analyzeEverything(force)
		if (this.app) {
			this.publishArtifact(this.app)
		}
	}

	/**
	 * Get the analyzed routes
	 */
	getRoutes(): readonly ExtendedRouteInfo[] {
		return this.analyzedRoutes
	}

	/**
	 * Get the analyzed schemas
	 */
	getSchemas(): readonly SchemaInfo[] {
		return this.analyzedSchemas
	}

	/**
	 * Get the generation info
	 */
	getGenerationInfo(): GeneratedClientInfo | null {
		return this.generatedInfos[0] ?? null
	}

	/**
	 * Get all generation infos
	 */
	getGenerationInfos(): readonly GeneratedClientInfo[] {
		return this.generatedInfos
	}

	/**
	 * Checks whether expected output files exist on disk
	 */
	private outputFilesExist(): boolean {
		if (!fs.existsSync(path.join(this.outputDir, 'rpc-artifact.json'))) {
			return false
		}
		if (!this.hasTypeScriptGenerator()) {
			return true
		}
		return fs.existsSync(path.join(this.outputDir, 'client.ts'))
	}

	private getArtifactPath(): string {
		return path.join(this.outputDir, 'rpc-artifact.json')
	}

	private writeArtifactToDisk(): void {
		const artifact = {
			routes: this.analyzedRoutes,
			schemas: this.analyzedSchemas
		}
		fs.mkdirSync(this.outputDir, { recursive: true })
		fs.writeFileSync(this.getArtifactPath(), JSON.stringify(artifact))
	}

	private loadArtifactFromDisk(): boolean {
		try {
			const raw = fs.readFileSync(this.getArtifactPath(), 'utf8')
			const parsed = JSON.parse(raw) as {
				routes?: unknown
				schemas?: unknown
			}
			if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.schemas)) {
				return false
			}
			this.analyzedRoutes = parsed.routes as ExtendedRouteInfo[]
			this.analyzedSchemas = parsed.schemas as SchemaInfo[]
			this.generatedInfos = []
			return true
		} catch {
			return false
		}
	}

	private async runGenerators(): Promise<GeneratedClientInfo[]> {
		const results: GeneratedClientInfo[] = []
		for (const generator of this.generators) {
			this.log(`Running generator: ${generator.name}`)
			const result = await generator.generate({
				outputDir: this.outputDir,
				routes: this.analyzedRoutes,
				schemas: this.analyzedSchemas
			})
			results.push(result)
		}
		return results
	}

	private hasTypeScriptGenerator(): boolean {
		return this.generators.some((generator) => generator.name === 'typescript-client')
	}

	private publishArtifact(app: Application): void {
		app.getContext().set(this.getArtifactContextKey(), {
			routes: this.analyzedRoutes,
			schemas: this.analyzedSchemas
		})
	}

	private getArtifactContextKey(): string {
		return `${this.contextNamespace}.${this.contextArtifactKey}`
	}

	/**
	 * Cleanup resources to prevent memory leaks
	 */
	dispose(): void {
		if (this.project) {
			this.project.getSourceFiles().forEach((file) => this.project!.removeSourceFile(file))
			this.project = null
		}
	}

	// ============================================================================
	// LOGGING UTILITIES
	// ============================================================================

	/**
	 * Logs a message with the plugin prefix
	 */
	private log(message: string): void {
		console.log(`${LOG_PREFIX} ${message}`)
	}

	/**
	 * Logs an error with the plugin prefix
	 */
	private logError(message: string, error?: unknown): void {
		console.error(`${LOG_PREFIX} ${message}`, error || '')
	}
}
