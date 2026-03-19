import type { Project } from 'ts-morph'
import type { GeneratedClientInfo } from '../types'
import type { PipelineExecutionContext, PipelineExecutionResult, StagedResult } from './pipeline.types'
import { AnalysisStage } from './analysis-stage'
import { TransformStage } from './transform-stage'
import { EmitStage } from './emit-stage'

/**
 * Pipeline Coordinator: High-level orchestrator for analysis → transform → emit stages.
 *
 * The pipeline coordinator manages the complete flow:
 * 1. Analysis stage: extract routes/schemas
 * 2. Transform stage: apply hooks and validate
 * 3. Emit stage: run generators and write artifacts
 *
 * Each stage receives immutable input and produces immutable output,
 * enabling clear error handling and potential incremental/cached execution.
 */
export class PipelineCoordinator {
	private readonly stagedResults: StagedResult[] = []

	constructor(
		private readonly analysisStage: AnalysisStage,
		private readonly transformStage: TransformStage,
		private readonly emitStage: EmitStage
	) {}

	/**
	 * Execute the complete pipeline (analysis → transform → emit).
	 * Returns full execution result with stage snapshots.
	 */
	async execute(
		project: Project,
		controllerPattern: string,
		context: PipelineExecutionContext,
		cacheHit: boolean = false
	): Promise<PipelineExecutionResult> {
		const startTime = performance.now()
		this.stagedResults.length = 0

		try {
			// Stage 1: Analysis
			const analysisStart = performance.now()
			const analysisResult = await this.analysisStage.execute(project, controllerPattern)
			const analysisDuration = performance.now() - analysisStart

			this.stagedResults.push({
				stage: 'analysis',
				result: analysisResult,
				duration: analysisDuration,
				errors: []
			})

			// Stage 2: Transform (skip on dry-run would normally happen, but let transforms run)
			const transformStart = performance.now()
			const transformResult = await this.transformStage.execute(analysisResult, context)
			const transformDuration = performance.now() - transformStart

			this.stagedResults.push({
				stage: 'transform',
				result: transformResult,
				duration: transformDuration,
				errors: []
			})

			// Stage 3: Emit
			const emitStart = performance.now()
			const emitResult = await this.emitStage.execute(transformResult, context)
			const emitDuration = performance.now() - emitStart

			this.stagedResults.push({
				stage: 'emission',
				result: emitResult as any,
				duration: emitDuration,
				errors: []
			})

			const totalDuration = performance.now() - startTime

			return {
				stages: [...this.stagedResults],
				finalResult: {
					routes: emitResult.routes,
					schemas: emitResult.schemas,
					warnings: emitResult.warnings
				},
				totalDuration,
				cacheHit
			}
		} catch (error) {
			const totalDuration = performance.now() - startTime

			// Capture error in appropriate stage
			const lastStage = this.stagedResults[this.stagedResults.length - 1]
			if (lastStage) {
				;(lastStage as any).errors.push(error instanceof Error ? error.message : String(error))
			}

			throw new Error(
				`Pipeline execution failed at stage ${this.stagedResults.length}: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}

	/**
	 * Get the staged results from the last execution.
	 */
	getLastExecution(): readonly StagedResult[] {
		return [...this.stagedResults]
	}

	/**
	 * Extract generated infos from completion result (used by emit stage).
	 */
	static extractGeneratedInfos(result: any): readonly GeneratedClientInfo[] {
		return result.generatedInfos ?? []
	}
}
