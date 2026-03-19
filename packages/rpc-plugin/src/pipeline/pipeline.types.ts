import type { ExtendedRouteInfo, RPCGeneratorCapability, SchemaInfo } from '../types'

/**
 * Immutable result snapshot from each pipeline stage.
 * Prevents mutation leaks between stages.
 */
export interface PipelineStageResult {
	readonly routes: readonly ExtendedRouteInfo[]
	readonly schemas: readonly SchemaInfo[]
	readonly warnings: readonly string[]
	readonly routeWarnings: readonly string[]
	readonly schemaWarnings: readonly string[]
}

/**
 * Pipeline execution context passed between stages.
 * Carries metadata, configuration, and immutable results.
 */
export interface PipelineExecutionContext {
	readonly outputDir: string
	readonly dryRun: boolean
	readonly mode: 'strict' | 'best-effort'
	readonly failOnSchemaError: boolean
	readonly failOnRouteAnalysisWarning: boolean
	readonly pluginApiVersion: string
	readonly pluginCapabilities: readonly RPCGeneratorCapability[]
}

/**
 * Stage lifecycle markers for tracing and error recovery.
 */
export type PipelineStageType = 'analysis' | 'transform' | 'emission'

/**
 * Result of a single pipeline stage execution.
 */
export interface StagedResult<T extends PipelineStageType = PipelineStageType> {
	readonly stage: T
	readonly result: PipelineStageResult
	readonly duration: number
	errors: string[]
}

/**
 * Complete pipeline execution result with all stage snapshots.
 */
export interface PipelineExecutionResult {
	readonly stages: readonly StagedResult[]
	readonly finalResult: PipelineStageResult
	readonly generatedInfos: readonly import('../types').GeneratedClientInfo[]
	readonly totalDuration: number
	readonly cacheHit: boolean
}
