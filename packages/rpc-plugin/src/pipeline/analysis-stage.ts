import type { Project } from 'ts-morph'
import type { RouteInfo } from 'honestjs'
import type { ExtendedRouteInfo, SchemaInfo } from '../types'
import type { RouteAnalyzerService } from '../services/route-analyzer.service'
import type { SchemaGeneratorService } from '../services/schema-generator.service'
import type { AnalysisGraphService } from '../services/analysis-graph.service'
import type { PipelineStageResult } from './pipeline.types'

/**
 * Analysis stage: Extract routes and schemas from source code.
 * Responsible for:
 * - Building the analysis graph (single AST pass)
 * - Analyzing controller methods and extracting route metadata
 * - Generating JSON schemas from collected types
 * - Collecting warnings and diagnostics
 */
export class AnalysisStage {
	constructor(
		private readonly routeAnalyzer: RouteAnalyzerService,
		private readonly schemaGenerator: SchemaGeneratorService,
		private readonly analysisGraphBuilder: AnalysisGraphService
	) {}

	/**
	 * Execute the analysis stage: build graph, analyze routes, generate schemas.
	 */
	async execute(
		project: Project,
		controllerPattern: string,
		appRoutes: readonly RouteInfo[]
	): Promise<PipelineStageResult> {
		const controllerSourceFiles = project.getSourceFiles(controllerPattern)
		const routeWarnings: string[] = []
		const schemaWarnings: string[] = []

		// Step 1: Single coordinated AST pass - build analysis graph
		const analysisGraph = this.analysisGraphBuilder.build(controllerSourceFiles)

		// Step 2: Analyze routes using pre-computed controller map
		const routes = await this.routeAnalyzer.analyzeControllerMethodsWithControllers(
			appRoutes,
			analysisGraph.controllers
		)
		routeWarnings.push(...this.routeAnalyzer.getWarnings())

		// Step 3: Generate schemas from collected types
		const schemas = await this.schemaGenerator.generateSchemasFromCollectedTypes(analysisGraph.collectedTypes)
		schemaWarnings.push(...this.schemaGenerator.getWarnings())

		return {
			routes: routes as readonly ExtendedRouteInfo[],
			schemas: schemas as readonly SchemaInfo[],
			warnings: [...routeWarnings, ...schemaWarnings],
			routeWarnings: [...routeWarnings],
			schemaWarnings: [...schemaWarnings]
		}
	}
}
