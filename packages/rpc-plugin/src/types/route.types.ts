import type { ParameterMetadata, RouteInfo } from 'honestjs'

/**
 * Parameter metadata with enhanced type information
 */
export interface ParameterMetadataWithType extends ParameterMetadata {
	readonly type: string
	readonly required: boolean
	readonly name: string
}

/**
 * Extended route information with comprehensive type data
 */
export interface ExtendedRouteInfo extends Omit<RouteInfo, 'parameters' | 'method'> {
	readonly returns?: string
	readonly parameters?: readonly ParameterMetadataWithType[]
	readonly method: string
	readonly fullPath: string
}

/**
 * Controller groups for organization
 */
export type ControllerGroups = Map<string, readonly ExtendedRouteInfo[]>

/**
 * Route parameter information for client generation
 * Extends ParameterMetadataWithType for consistency
 */
export interface RouteParameter extends ParameterMetadataWithType {
	// Additional properties specific to client generation can be added here
}
