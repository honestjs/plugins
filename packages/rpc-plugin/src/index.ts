// Main plugin export
export { RPCPlugin } from './rpc.plugin'

// Export all types
export type {
	ApiError,
	ApiResponse,
	ControllerGroups,
	ExtendedRouteInfo,
	GeneratedClientInfo,
	ParameterMetadataWithType,
	RequestOptions,
	RouteParameter,
	RPCPluginOptions,
	SchemaInfo
} from './types'

// Export services for advanced usage
export { ClientGeneratorService } from './services/client-generator.service'
export { RouteAnalyzerService } from './services/route-analyzer.service'
export { SchemaGeneratorService } from './services/schema-generator.service'

// Export utilities for custom implementations
export * from './utils/path-utils'
export * from './utils/schema-utils'
export * from './utils/string-utils'
export * from './utils/type-utils'

// Export constants
export * from './constants/defaults'
