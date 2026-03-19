import type { GeneratedClientInfo, RPCGenerator } from '../types'
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

		// Skip generation on dryRun
		if (!context.dryRun) {
			// Step 1: Run generators in parallel (outputs must be isolated)
			const results = await Promise.all(
				this.generators.map((generator) =>
					generator.generate({
						outputDir: context.outputDir,
						routes: input.routes,
						schemas: input.schemas,
						pluginApiVersion: context.pluginApiVersion,
						pluginCapabilities: context.pluginCapabilities
					})
				)
			)
			generatedInfos.push(...results)
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
			await reporter(emitState)
		}

		return {
			routes: input.routes,
			schemas: input.schemas,
			warnings: input.warnings,
			routeWarnings: input.routeWarnings,
			schemaWarnings: input.schemaWarnings,
			generatedInfos
		}
	}
}
