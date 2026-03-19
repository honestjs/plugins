import type { ExtendedRouteInfo } from './route.types'
import type { GeneratedClientInfo, SchemaInfo } from './schema.types'

export type RPCGeneratorCapability =
	| 'routes'
	| 'schemas'
	| 'analysis-hooks'
	| 'atomic-persistence'
	| 'client-interceptors'

/**
 * Context passed to each RPC generator.
 */
export interface RPCGeneratorContext {
	readonly outputDir: string
	readonly routes: readonly ExtendedRouteInfo[]
	readonly schemas: readonly SchemaInfo[]
	readonly pluginApiVersion: string
	readonly pluginCapabilities: readonly RPCGeneratorCapability[]
}

/**
 * Contract for custom RPC generators.
 */
export interface RPCGenerator {
	readonly name: string
	readonly supportedApiVersions?: readonly string[]
	readonly requiredCapabilities?: readonly RPCGeneratorCapability[]
	generate(context: RPCGeneratorContext): Promise<GeneratedClientInfo>
}
