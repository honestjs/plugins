import fs from 'fs'
import type { Application, IPlugin, RouteInfo } from 'honestjs'
import type { Hono } from 'hono'
import path from 'path'
import { ClassDeclaration, Project } from 'ts-morph'

import { DEFAULT_OPTIONS, LOG_PREFIX } from './constants/defaults'
import { TypeScriptClientGenerator } from './generators'
import { computeContentHash, computeHash, readChecksum, writeChecksum } from './utils/hash-utils'
import { parseRpcArtifact, RPC_ARTIFACT_VERSION } from './utils/artifact-contract'
import { writeJsonAtomic } from './utils/atomic-file-utils'
import { AnalysisGraphService } from './services/analysis-graph.service'
import { RouteAnalyzerService } from './services/route-analyzer.service'
import { SchemaGeneratorService } from './services/schema-generator.service'
import { AnalysisStage, EmitStage, PipelineCoordinator, TransformStage } from './pipeline'
import type { ExtendedRouteInfo, GeneratedClientInfo, RPCGenerator, RPCGeneratorCapability, SchemaInfo } from './types'

export type RPCMode = 'strict' | 'best-effort'
export type RPCLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

export const RPC_PLUGIN_API_VERSION = '1'
export const RPC_PLUGIN_CAPABILITIES: readonly RPCGeneratorCapability[] = [
	'routes',
	'schemas',
	'analysis-hooks',
	'atomic-persistence',
	'client-interceptors'
]

export interface RPCDiagnostics {
	readonly generatedAt: string
	readonly mode: RPCMode
	readonly dryRun: boolean
	readonly cache: 'hit' | 'miss' | 'bypass'
	readonly routesCount: number
	readonly schemasCount: number
	readonly warnings: readonly string[]
}

export interface RPCAnalysisState {
	readonly routes: readonly ExtendedRouteInfo[]
	readonly schemas: readonly SchemaInfo[]
	readonly warnings: readonly string[]
	readonly dryRun: boolean
	readonly mode: RPCMode
	readonly outputDir: string
}

export interface RPCEmitState extends RPCAnalysisState {
	readonly generatedInfos: readonly GeneratedClientInfo[]
}

export type RPCPreAnalysisFilter = (
	routes: readonly RouteInfo[]
) => readonly RouteInfo[] | Promise<readonly RouteInfo[]>

export type RPCPostAnalysisTransform = (state: RPCAnalysisState) => RPCAnalysisState | Promise<RPCAnalysisState>

export type RPCPreEmitValidator = (state: RPCAnalysisState) => void | Promise<void>

export type RPCPostEmitReporter = (state: RPCEmitState) => void | Promise<void>

/**
 * Configuration options for the RPCPlugin
 */
export interface RPCPluginOptions {
	readonly controllerPattern?: string
	readonly tsConfigPath?: string
	readonly outputDir?: string
	readonly generateOnInit?: boolean
	readonly generators?: readonly RPCGenerator[]
	readonly mode?: RPCMode
	readonly logLevel?: RPCLogLevel
	readonly customClassMatcher?: (classDeclaration: ClassDeclaration) => boolean
	readonly failOnSchemaError?: boolean
	readonly failOnRouteAnalysisWarning?: boolean
	readonly context?: {
		readonly namespace?: string
		readonly keys?: {
			readonly artifact?: string
		}
	}
	readonly hooks?: {
		readonly preAnalysisFilters?: readonly RPCPreAnalysisFilter[]
		readonly postAnalysisTransforms?: readonly RPCPostAnalysisTransform[]
		readonly preEmitValidators?: readonly RPCPreEmitValidator[]
		readonly postEmitReporters?: readonly RPCPostEmitReporter[]
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
	private readonly mode: RPCMode
	private readonly logLevel: RPCLogLevel
	private readonly failOnSchemaError: boolean
	private readonly failOnRouteAnalysisWarning: boolean
	private readonly customClassMatcher?: (classDeclaration: ClassDeclaration) => boolean
	private readonly preAnalysisFilters: readonly RPCPreAnalysisFilter[]
	private readonly postAnalysisTransforms: readonly RPCPostAnalysisTransform[]
	private readonly preEmitValidators: readonly RPCPreEmitValidator[]
	private readonly postEmitReporters: readonly RPCPostEmitReporter[]

	// Services
	private readonly routeAnalyzer: RouteAnalyzerService
	private readonly schemaGenerator: SchemaGeneratorService
	private readonly analysisGraphBuilder: AnalysisGraphService
	private readonly generators: readonly RPCGenerator[]

	// Shared ts-morph project
	private project: Project | null = null

	// Internal state
	private analyzedRoutes: ExtendedRouteInfo[] = []
	private analyzedSchemas: SchemaInfo[] = []
	private generatedInfos: GeneratedClientInfo[] = []
	private diagnostics: RPCDiagnostics | null = null
	private app: Application | null = null
	private analysisQueue: Promise<void> = Promise.resolve()

	constructor(options: RPCPluginOptions = {}) {
		this.controllerPattern = options.controllerPattern ?? DEFAULT_OPTIONS.controllerPattern
		this.tsConfigPath = options.tsConfigPath ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.tsConfigPath)
		this.outputDir = options.outputDir ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.outputDir)
		this.generateOnInit = options.generateOnInit ?? DEFAULT_OPTIONS.generateOnInit
		this.mode = options.mode ?? DEFAULT_OPTIONS.mode
		this.logLevel = options.logLevel ?? DEFAULT_OPTIONS.logLevel
		this.contextNamespace = options.context?.namespace ?? DEFAULT_OPTIONS.context.namespace
		this.contextArtifactKey = options.context?.keys?.artifact ?? DEFAULT_OPTIONS.context.keys.artifact
		this.customClassMatcher = options.customClassMatcher
		this.failOnSchemaError = options.failOnSchemaError ?? this.mode === 'strict'
		this.failOnRouteAnalysisWarning = options.failOnRouteAnalysisWarning ?? this.mode === 'strict'
		this.preAnalysisFilters = options.hooks?.preAnalysisFilters ?? []
		this.postAnalysisTransforms = options.hooks?.postAnalysisTransforms ?? []
		this.preEmitValidators = options.hooks?.preEmitValidators ?? []
		this.postEmitReporters = options.hooks?.postEmitReporters ?? []

		// Initialize services
		this.routeAnalyzer = new RouteAnalyzerService({
			customClassMatcher: this.customClassMatcher,
			onWarn: (message, details) => this.logWarn(message, details)
		})
		this.schemaGenerator = new SchemaGeneratorService(this.controllerPattern, this.tsConfigPath, {
			failOnSchemaError: this.failOnSchemaError,
			onWarn: (message, details) => this.logWarn(message, details)
		})
		this.analysisGraphBuilder = new AnalysisGraphService({
			customClassMatcher: this.customClassMatcher
		})
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
		if (!['strict', 'best-effort'].includes(this.mode)) {
			errors.push('Mode must be "strict" or "best-effort"')
		}
		if (!['silent', 'error', 'warn', 'info', 'debug'].includes(this.logLevel)) {
			errors.push('logLevel must be one of: silent, error, warn, info, debug')
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

			const supportedVersions = generator.supportedApiVersions ?? [RPC_PLUGIN_API_VERSION]
			if (!Array.isArray(supportedVersions) || supportedVersions.some((version) => typeof version !== 'string')) {
				errors.push(`Generator "${generator.name || 'unknown'}" has invalid supportedApiVersions`)
			} else if (!supportedVersions.includes(RPC_PLUGIN_API_VERSION)) {
				errors.push(
					`Generator "${generator.name || 'unknown'}" does not support RPC plugin API version ${RPC_PLUGIN_API_VERSION}`
				)
			}

			const requiredCapabilities = generator.requiredCapabilities ?? []
			if (
				!Array.isArray(requiredCapabilities) ||
				requiredCapabilities.some((capability) => typeof capability !== 'string')
			) {
				errors.push(`Generator "${generator.name || 'unknown'}" has invalid requiredCapabilities`)
			} else {
				for (const capability of requiredCapabilities) {
					if (!RPC_PLUGIN_CAPABILITIES.includes(capability)) {
						errors.push(
							`Generator "${generator.name || 'unknown'}" requires unsupported capability "${capability}"`
						)
					}
				}
			}
		}
		for (const hook of this.preAnalysisFilters) {
			if (typeof hook !== 'function') {
				errors.push('preAnalysisFilters entries must be functions')
			}
		}
		for (const hook of this.postAnalysisTransforms) {
			if (typeof hook !== 'function') {
				errors.push('postAnalysisTransforms entries must be functions')
			}
		}
		for (const hook of this.preEmitValidators) {
			if (typeof hook !== 'function') {
				errors.push('preEmitValidators entries must be functions')
			}
		}
		for (const hook of this.postEmitReporters) {
			if (typeof hook !== 'function') {
				errors.push('postEmitReporters entries must be functions')
			}
		}

		if (errors.length > 0) {
			throw new Error(`Configuration validation failed: ${errors.join(', ')}`)
		}

		this.log(
			`Configuration validated: controllerPattern=${this.controllerPattern}, tsConfigPath=${this.tsConfigPath}, outputDir=${this.outputDir}, mode=${this.mode}`
		)
	}

	/**
	 * Called after all modules are registered
	 */
	afterModulesRegistered = async (app: Application, hono: Hono): Promise<void> => {
		this.app = app
		if (this.generateOnInit) {
			await this.analyzeEverything({ force: false, dryRun: false })
			this.publishArtifact(app)
		}
	}

	/**
	 * Main analysis method that coordinates all three components
	 */
	private async analyzeEverything(options: { force: boolean; dryRun: boolean }): Promise<void> {
		const { force, dryRun } = options
		const warnings: string[] = []
		let cacheState: RPCDiagnostics['cache'] = force ? 'bypass' : 'miss'
		const generatorsHash = this.computeGeneratorsHash()

		try {
			this.log('Starting comprehensive RPC analysis...')

			// Create a single shared ts-morph project for both services
			this.dispose()
			const project = new Project({ tsConfigFilePath: this.tsConfigPath })
			project.addSourceFilesAtPaths([this.controllerPattern])
			this.project = project

			const controllerSourceFiles = project.getSourceFiles(this.controllerPattern)

			// Hash check: skip if controller files are unchanged since last generation
			const filePaths = controllerSourceFiles.map((f) => f.getFilePath())

			if (!force) {
				const currentHash = computeHash(filePaths)
				const stored = readChecksum(this.outputDir)

				if (
					stored &&
					stored.hash === currentHash &&
					stored.generatorsHash === generatorsHash &&
					stored.artifactVersion === RPC_ARTIFACT_VERSION &&
					this.outputFilesExist()
				) {
					if (this.loadArtifactFromDisk()) {
						cacheState = 'hit'
						this.logDebug('Source files unchanged - skipping regeneration')
						this.diagnostics = {
							generatedAt: new Date().toISOString(),
							mode: this.mode,
							dryRun,
							cache: cacheState,
							routesCount: this.analyzedRoutes.length,
							schemasCount: this.analyzedSchemas.length,
							warnings: []
						}
						this.dispose()
						return
					}
					this.logDebug('Source files unchanged but cached artifact missing/invalid - regenerating')
				}
			}

			// Clear previous analysis results to prevent stale state across runs
			this.analyzedRoutes = []
			this.analyzedSchemas = []
			this.generatedInfos = []

			const appRoutes = await this.applyPreAnalysisFilters(this.app?.getRoutes() ?? [])
			const pipeline = new PipelineCoordinator(
				new AnalysisStage(this.routeAnalyzer, this.schemaGenerator, this.analysisGraphBuilder),
				new TransformStage(this.postAnalysisTransforms, this.preEmitValidators),
				new EmitStage(this.generators, this.postEmitReporters)
			)

			const pipelineResult = await pipeline.execute(project, this.controllerPattern, appRoutes, {
				outputDir: this.outputDir,
				dryRun,
				mode: this.mode,
				failOnSchemaError: this.failOnSchemaError,
				failOnRouteAnalysisWarning: this.failOnRouteAnalysisWarning,
				pluginApiVersion: RPC_PLUGIN_API_VERSION,
				pluginCapabilities: RPC_PLUGIN_CAPABILITIES
			})

			this.analyzedRoutes = [...pipelineResult.finalResult.routes]
			this.analyzedSchemas = [...pipelineResult.finalResult.schemas]
			this.generatedInfos = [...pipelineResult.generatedInfos]
			warnings.splice(0, warnings.length, ...pipelineResult.finalResult.warnings)

			if (!dryRun) {
				const analysisHash = computeContentHash(
					JSON.stringify({ routes: this.analyzedRoutes, schemas: this.analyzedSchemas })
				)

				// Write checksum after successful generation
				await writeChecksum(this.outputDir, {
					hash: computeHash(filePaths),
					files: filePaths,
					artifactVersion: RPC_ARTIFACT_VERSION,
					analysisHash,
					generatorsHash
				})
				await this.writeArtifactToDisk()
			}

			this.diagnostics = {
				generatedAt: new Date().toISOString(),
				mode: this.mode,
				dryRun,
				cache: cacheState,
				routesCount: this.analyzedRoutes.length,
				schemasCount: this.analyzedSchemas.length,
				warnings
			}
			await this.writeDiagnosticsToDisk()

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
	async analyze(force: boolean): Promise<void>
	async analyze(options: { force?: boolean; dryRun?: boolean }): Promise<void>
	async analyze(forceOrOptions: boolean | { force?: boolean; dryRun?: boolean } = true): Promise<void> {
		const options =
			typeof forceOrOptions === 'boolean'
				? { force: forceOrOptions, dryRun: false }
				: { force: forceOrOptions.force ?? true, dryRun: forceOrOptions.dryRun ?? false }

		const run = async (): Promise<void> => {
			await this.analyzeEverything(options)
			if (this.app && !options.dryRun) {
				this.publishArtifact(this.app)
			}
		}

		const queuedRun = this.analysisQueue.then(run)
		this.analysisQueue = queuedRun.catch(() => undefined)

		await queuedRun
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

	getDiagnostics(): RPCDiagnostics | null {
		return this.diagnostics
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

	private getDiagnosticsPath(): string {
		return path.join(this.outputDir, 'rpc-diagnostics.json')
	}

	private async writeArtifactToDisk(): Promise<void> {
		const artifact = {
			artifactVersion: RPC_ARTIFACT_VERSION,
			routes: this.analyzedRoutes,
			schemas: this.analyzedSchemas
		}
		await writeJsonAtomic(this.getArtifactPath(), artifact, false)
	}

	private async writeDiagnosticsToDisk(): Promise<void> {
		if (!this.diagnostics) return
		await writeJsonAtomic(this.getDiagnosticsPath(), this.diagnostics)
	}

	private loadArtifactFromDisk(): boolean {
		try {
			const raw = fs.readFileSync(this.getArtifactPath(), 'utf8')
			const parsed = parseRpcArtifact(JSON.parse(raw))
			if (!parsed) {
				return false
			}

			this.analyzedRoutes = parsed.routes
			this.analyzedSchemas = parsed.schemas
			this.generatedInfos = []
			return true
		} catch {
			return false
		}
	}

	private async runGenerators(): Promise<GeneratedClientInfo[]> {
		for (const generator of this.generators) {
			this.log(`Running generator: ${generator.name}`)
		}

		return Promise.all(
			this.generators.map((generator) =>
				generator.generate({
					outputDir: this.outputDir,
					routes: this.analyzedRoutes,
					schemas: this.analyzedSchemas,
					pluginApiVersion: RPC_PLUGIN_API_VERSION,
					pluginCapabilities: RPC_PLUGIN_CAPABILITIES
				})
			)
		)
	}

	private hasTypeScriptGenerator(): boolean {
		return this.generators.some((generator) => generator.name === 'typescript-client')
	}

	private async applyPreAnalysisFilters(routes: readonly RouteInfo[]): Promise<readonly RouteInfo[]> {
		let currentRoutes = routes
		for (const filter of this.preAnalysisFilters) {
			currentRoutes = await filter(currentRoutes)
		}
		return currentRoutes
	}

	private async applyPostAnalysisTransforms(state: RPCAnalysisState): Promise<RPCAnalysisState> {
		let currentState = state
		for (const transform of this.postAnalysisTransforms) {
			currentState = await transform(currentState)
		}
		return currentState
	}

	private async runPreEmitValidators(state: RPCAnalysisState): Promise<void> {
		for (const validator of this.preEmitValidators) {
			await validator(state)
		}
	}

	private async runPostEmitReporters(state: RPCEmitState): Promise<void> {
		for (const reporter of this.postEmitReporters) {
			await reporter(state)
		}
	}

	private computeGeneratorsHash(): string {
		const generatorNames = this.generators.map((generator) => generator.name).sort()
		return computeContentHash(JSON.stringify(generatorNames))
	}

	private publishArtifact(app: Application): void {
		app.getContext().set(this.getArtifactContextKey(), {
			artifactVersion: RPC_ARTIFACT_VERSION,
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
			for (const sourceFile of this.project.getSourceFiles()) {
				this.project.removeSourceFile(sourceFile)
			}
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
		if (this.canLog('info')) {
			console.log(`${LOG_PREFIX} ${message}`)
		}
	}

	/**
	 * Logs an error with the plugin prefix
	 */
	private logError(message: string, error?: unknown): void {
		if (this.canLog('error')) {
			console.error(`${LOG_PREFIX} ${message}`, error || '')
		}
	}

	private logWarn(message: string, details?: unknown): void {
		if (this.canLog('warn')) {
			console.warn(`${LOG_PREFIX} ${message}`, details || '')
		}
	}

	private logDebug(message: string): void {
		if (this.canLog('debug')) {
			console.log(`${LOG_PREFIX} ${message}`)
		}
	}

	private canLog(level: 'error' | 'warn' | 'info' | 'debug'): boolean {
		const order: Record<RPCLogLevel, number> = {
			silent: 0,
			error: 1,
			warn: 2,
			info: 3,
			debug: 4
		}

		return order[this.logLevel] >= order[level]
	}
}
