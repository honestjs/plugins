import type { RPCAnalysisState, RPCPostAnalysisTransform, RPCPreEmitValidator } from '../rpc.plugin'
import type { PipelineExecutionContext, PipelineStageResult } from './pipeline.types'

/**
 * Transform stage: Apply hooks, transforms, and validation.
 * Responsible for:
 * - Running post-analysis transform hooks
 * - Running pre-emit validators
 * - Enforcing strict mode constraints
 * - Collecting validation errors
 */
export class TransformStage {
	constructor(
		private readonly postAnalysisTransforms: readonly RPCPostAnalysisTransform[],
		private readonly preEmitValidators: readonly RPCPreEmitValidator[]
	) {}

	/**
	 * Execute the transform stage: apply transforms and validators.
	 */
	async execute(input: PipelineStageResult, context: PipelineExecutionContext): Promise<PipelineStageResult> {
		const errors: string[] = []

		// Step 1: Apply post-analysis transforms to mutate state if needed
		const state: RPCAnalysisState = {
			routes: input.routes,
			schemas: input.schemas,
			warnings: [...input.warnings],
			dryRun: context.dryRun,
			mode: context.mode,
			outputDir: context.outputDir
		}

		for (const transform of this.postAnalysisTransforms) {
			try {
				const transformed = await transform(state)
				// Update state with transformed values
				;(state as any).routes = transformed.routes
				;(state as any).schemas = transformed.schemas
				;(state as any).warnings = transformed.warnings
			} catch (error) {
				errors.push(`Post-analysis transform failed: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		// Step 2: Run pre-emit validators
		for (const validator of this.preEmitValidators) {
			try {
				await validator(state)
			} catch (error) {
				errors.push(`Pre-emit validation failed: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		// Step 3: Enforce strict mode constraints
		if (context.mode === 'strict') {
			if (context.failOnSchemaError && state.warnings.some((w) => w.includes('schema'))) {
				errors.push('Schema warnings encountered in strict mode')
			}
		}

		if (errors.length > 0) {
			throw new Error(`Transform stage failed: ${errors.join('; ')}`)
		}

		return {
			routes: state.routes,
			schemas: state.schemas,
			warnings: state.warnings
		}
	}
}
