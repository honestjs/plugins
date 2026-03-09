import fs from 'fs'
import type { Application, IPlugin } from 'honestjs'
import type { Hono } from 'hono'
import path from 'path'
import { Project } from 'ts-morph'

import { DEFAULT_OPTIONS, LOG_PREFIX } from './constants/defaults'
import { computeHash, readChecksum, writeChecksum } from './utils/hash-utils'
import { ClientGeneratorService } from './services/client-generator.service'
import { OpenApiGeneratorService, type ResolvedOpenApiOptions } from './services/openapi-generator.service'
import { RouteAnalyzerService } from './services/route-analyzer.service'
import { SchemaGeneratorService } from './services/schema-generator.service'
import type { ExtendedRouteInfo, GeneratedClientInfo, SchemaInfo } from './types'

export interface OpenApiOptions {
	readonly title?: string
	readonly version?: string
	readonly description?: string
	readonly servers?: readonly { url: string; description?: string }[]
	readonly outputFile?: string
}

/**
 * Configuration options for the RPCPlugin
 */
export interface RPCPluginOptions {
	readonly controllerPattern?: string
	readonly tsConfigPath?: string
	readonly outputDir?: string
	readonly generateOnInit?: boolean
	readonly openapi?: OpenApiOptions | boolean
}

/**
 * Comprehensive RPC plugin that combines route analysis, schema generation, and client generation
 */
export class RPCPlugin implements IPlugin {
	private readonly controllerPattern: string
	private readonly tsConfigPath: string
	private readonly outputDir: string
	private readonly generateOnInit: boolean

	// Services
	private readonly routeAnalyzer: RouteAnalyzerService
	private readonly schemaGenerator: SchemaGeneratorService
	private readonly clientGenerator: ClientGeneratorService
	private readonly openApiGenerator: OpenApiGeneratorService | null
	private readonly openApiOptions: ResolvedOpenApiOptions | null

	// Shared ts-morph project
	private project: Project | null = null

	// Internal state
	private analyzedRoutes: ExtendedRouteInfo[] = []
	private analyzedSchemas: SchemaInfo[] = []
	private generatedInfo: GeneratedClientInfo | null = null

	constructor(options: RPCPluginOptions = {}) {
		this.controllerPattern = options.controllerPattern ?? DEFAULT_OPTIONS.controllerPattern
		this.tsConfigPath = options.tsConfigPath ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.tsConfigPath)
		this.outputDir = options.outputDir ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.outputDir)
		this.generateOnInit = options.generateOnInit ?? DEFAULT_OPTIONS.generateOnInit

		// Initialize services
		this.routeAnalyzer = new RouteAnalyzerService()
		this.schemaGenerator = new SchemaGeneratorService(this.controllerPattern, this.tsConfigPath)
		this.clientGenerator = new ClientGeneratorService(this.outputDir)

		// Resolve OpenAPI options
		this.openApiOptions = this.resolveOpenApiOptions(options.openapi)
		this.openApiGenerator = this.openApiOptions ? new OpenApiGeneratorService(this.outputDir) : null

		this.validateConfiguration()
	}

	private resolveOpenApiOptions(input?: OpenApiOptions | boolean): ResolvedOpenApiOptions | null {
		if (!input) return null

		const opts: OpenApiOptions = input === true ? {} : input

		return {
			title: opts.title ?? 'API',
			version: opts.version ?? '1.0.0',
			description: opts.description ?? '',
			servers: opts.servers ?? [],
			outputFile: opts.outputFile ?? 'openapi.json'
		}
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
		if (this.generateOnInit) {
			await this.analyzeEverything()
		}
	}

	/**
	 * Main analysis method that coordinates all three components
	 */
	private async analyzeEverything(force = false): Promise<void> {
		try {
			this.log('Starting comprehensive RPC analysis...')

			// Clear previous analysis results to prevent memory leaks
			this.analyzedRoutes = []
			this.analyzedSchemas = []
			this.generatedInfo = null

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
					this.log('Source files unchanged — skipping regeneration')
					this.dispose()
					return
				}
			}

			// Step 1: Analyze routes and extract type information
			this.analyzedRoutes = await this.routeAnalyzer.analyzeControllerMethods(this.project)

			// Step 2: Generate schemas from the types we found
			this.analyzedSchemas = await this.schemaGenerator.generateSchemas(this.project)

			// Step 3: Generate the RPC client
			this.generatedInfo = await this.clientGenerator.generateClient(this.analyzedRoutes, this.analyzedSchemas)

			// Step 4: Generate OpenAPI spec (if enabled)
			if (this.openApiGenerator && this.openApiOptions) {
				const specPath = await this.openApiGenerator.generateSpec(
					this.analyzedRoutes,
					this.analyzedSchemas,
					this.openApiOptions
				)
				this.log(`OpenAPI spec generated: ${specPath}`)
			}

			// Write checksum after successful generation
			await writeChecksum(this.outputDir, { hash: computeHash(filePaths), files: filePaths })

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
		return this.generatedInfo
	}

	/**
	 * Checks whether expected output files exist on disk
	 */
	private outputFilesExist(): boolean {
		if (!fs.existsSync(path.join(this.outputDir, 'client.ts'))) return false
		if (this.openApiOptions) {
			return fs.existsSync(path.join(this.outputDir, this.openApiOptions.outputFile))
		}
		return true
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
