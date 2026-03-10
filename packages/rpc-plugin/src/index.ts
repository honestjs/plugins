// Main plugin export
export { RPCPlugin } from './rpc.plugin'

// Export all types
export type {
	ApiError,
	ControllerGroups,
	ExtendedRouteInfo,
	FetchFunction,
	GeneratedClientInfo,
	ParameterMetadataWithType,
	RPCGenerator,
	RPCGeneratorContext,
	RequestOptions,
	RouteParameter,
	RPCPluginOptions,
	SchemaInfo
} from './types'

// Export services for advanced usage
export { TypeScriptClientGenerator } from './generators'
export { RouteAnalyzerService } from './services/route-analyzer.service'
export { SchemaGeneratorService } from './services/schema-generator.service'

// Export utilities for custom implementations
export * from './utils/hash-utils'
export * from './utils/path-utils'
export * from './utils/schema-utils'
export * from './utils/string-utils'
export * from './utils/type-utils'

// Export constants
export * from './constants/defaults'
