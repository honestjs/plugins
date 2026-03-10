import type { ExtendedRouteInfo } from './route.types'
import type { GeneratedClientInfo, SchemaInfo } from './schema.types'

/**
 * Context passed to each RPC generator.
 */
export interface RPCGeneratorContext {
	readonly outputDir: string
	readonly routes: readonly ExtendedRouteInfo[]
	readonly schemas: readonly SchemaInfo[]
}

/**
 * Contract for custom RPC generators.
 */
export interface RPCGenerator {
	readonly name: string
	generate(context: RPCGeneratorContext): Promise<GeneratedClientInfo>
}
