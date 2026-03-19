import type { GeneratedClientInfo, ExtendedRouteInfo, SchemaInfo, RPCGenerator } from '../types'
import type { RPCPostEmitReporter } from '../rpc.plugin'
import type { PipelineExecutionContext, PipelineStageResult } from './pipeline.types'

/**
 * Emit stage: Run generators and produce client code.
 * Responsible for:
 * - Executing configured generators in parallel (with isolated outputs)
 * - Writing generated artifacts atomically
 * - Running post-emit reporter hooks
 * - Collecting generation info and errors
 */
export class EmitStage {
	constructor(
		private readonly generators: readonly RPCGenerator[],
		private readonly postEmitReporters: readonly RPCPostEmitReporter[]
	) {}

	/**
	 * Execute the emit stage: run generators and write outputs.
	 */
	async execute(
		input: PipelineStageResult,
		context: PipelineExecutionContext
	): Promise<PipelineStageResult & { readonly generatedInfos: readonly GeneratedClientInfo[] }> {
		const generatedInfos: GeneratedClientInfo[] = []
		const errors: string[] = []

		// Skip generation on dryRun
		if (!context.dryRun) {
			// Step 1: Run generators in parallel (outputs must be isolated)
			const generatorResults = await Promise.allSettled(
				this.generators.map((generator) =>
					generator.generate({
						outputDir: context.outputDir,
						routes: input.routes,
						schemas: input.schemas,
						pluginApiVersion: '1',
						pluginCapabilities: [
							'routes',
							'schemas',
							'analysis-hooks',
							'atomic-persistence',
							'client-interceptors'
						]
					})
				)
			)

			for (let i = 0; i < generatorResults.length; i++) {
				const result = generatorResults[i]
				const generator = this.generators[i]

				if (result.status === 'fulfilled') {
					generatedInfos.push(result.value)
				} else {
					errors.push(
						`Generator "${generator?.name ?? 'unknown'}" failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
					)
				}
			}
		}

		// Step 2: Run post-emit reporters (informational, don't block on failure)
		const emitState = {
			routes: input.routes,
			schemas: input.schemas,
			warnings: input.warnings,
			dryRun: context.dryRun,
			mode: context.mode,
			outputDir: context.outputDir,
			generatedInfos
		}

		for (const reporter of this.postEmitReporters) {
			try {
				await reporter(emitState)
			} catch (error) {
				// Log but don't fail on reporter errors
				console.warn(`Post-emit reporter failed: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		if (errors.length > 0 && !context.dryRun) {
			throw new Error(`Emit stage failed: ${errors.join('; ')}`)
		}

		return {
			routes: input.routes,
			schemas: input.schemas,
			warnings: input.warnings,
			generatedInfos
		}
	}
}
