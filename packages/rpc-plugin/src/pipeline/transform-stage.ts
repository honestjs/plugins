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
		let state: RPCAnalysisState = {
			routes: input.routes,
			schemas: input.schemas,
			warnings: [...input.warnings],
			dryRun: context.dryRun,
			mode: context.mode,
			outputDir: context.outputDir
		}

		// Step 1: Apply post-analysis transforms
		for (const transform of this.postAnalysisTransforms) {
			state = await transform(state)
		}

		// Step 2: Run pre-emit validators
		for (const validator of this.preEmitValidators) {
			await validator(state)
		}

		// Step 3: Enforce strict mode constraints
		if (context.mode === 'strict' && context.failOnSchemaError) {
			if (input.schemaWarnings.length > 0) {
				throw new Error(`Schema warnings encountered in strict mode: ${input.schemaWarnings.join('; ')}`)
			}
		}

		if (context.mode === 'strict' && context.failOnRouteAnalysisWarning) {
			if (input.routeWarnings.length > 0) {
				throw new Error(`Route analysis warnings encountered in strict mode: ${input.routeWarnings.join('; ')}`)
			}
		}

		return {
			routes: state.routes,
			schemas: state.schemas,
			warnings: state.warnings,
			routeWarnings: input.routeWarnings,
			schemaWarnings: input.schemaWarnings
		}
	}
}
