import fs from 'fs'
import type { Application, IPlugin } from 'honestjs'
import type { Hono } from 'hono'
import path from 'path'

import { DEFAULT_OPTIONS, LOG_PREFIX } from './constants/defaults'
import { ClientGeneratorService } from './services/client-generator.service'
import { RouteAnalyzerService } from './services/route-analyzer.service'
import { SchemaGeneratorService } from './services/schema-generator.service'
import type { ExtendedRouteInfo, GeneratedClientInfo, SchemaInfo } from './types'

/**
 * Configuration options for the RPCPlugin
 */
export interface RPCPluginOptions {
	readonly controllerPattern?: string
	readonly tsConfigPath?: string
	readonly outputDir?: string
	readonly generateOnInit?: boolean
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

	// Internal state
	private readonly analyzedRoutes: ExtendedRouteInfo[] = []
	private readonly analyzedSchemas: SchemaInfo[] = []
	private generatedInfo: GeneratedClientInfo | null = null

	constructor(options: RPCPluginOptions = {}) {
		this.controllerPattern = options.controllerPattern ?? DEFAULT_OPTIONS.controllerPattern
		this.tsConfigPath = options.tsConfigPath ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.tsConfigPath)
		this.outputDir = options.outputDir ?? path.resolve(process.cwd(), DEFAULT_OPTIONS.outputDir)
		this.generateOnInit = options.generateOnInit ?? DEFAULT_OPTIONS.generateOnInit

		// Initialize services
		this.routeAnalyzer = new RouteAnalyzerService(this.controllerPattern, this.tsConfigPath)
		this.schemaGenerator = new SchemaGeneratorService(this.controllerPattern, this.tsConfigPath)
		this.clientGenerator = new ClientGeneratorService(this.outputDir)

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
	private async analyzeEverything(): Promise<void> {
		try {
			this.log('Starting comprehensive RPC analysis...')

			// Step 1: Analyze routes and extract type information
			this.analyzedRoutes.push(...(await this.routeAnalyzer.analyzeControllerMethods()))

			// Step 2: Generate schemas from the types we found
			this.analyzedSchemas.push(...(await this.schemaGenerator.generateSchemas()))

			// Step 3: Generate the RPC client
			this.generatedInfo = await this.clientGenerator.generateClient(this.analyzedRoutes, this.analyzedSchemas)

			this.log(
				`✅ RPC analysis complete: ${this.analyzedRoutes.length} routes, ${this.analyzedSchemas.length} schemas`
			)
		} catch (error) {
			this.logError('Error during RPC analysis:', error)
			// Ensure cleanup happens even on error
			this.dispose()
			throw error
		}
	}

	/**
	 * Manually trigger analysis (useful for testing or re-generation)
	 */
	async analyze(): Promise<void> {
		await this.analyzeEverything()
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
	 * Cleanup resources to prevent memory leaks
	 */
	dispose(): void {
		this.routeAnalyzer.dispose()
		this.schemaGenerator.dispose()
		this.log('Resources cleaned up')
	}

	/**
	 * Plugin lifecycle cleanup
	 */
	onDestroy(): void {
		this.dispose()
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
