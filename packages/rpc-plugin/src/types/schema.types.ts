/**
 * Schema with comprehensive type information
 */
export interface SchemaInfo {
	readonly type: string
	readonly schema: Record<string, any>
	readonly typescriptType?: string
}

/**
 * Generated output information for one generator run.
 */
export interface GeneratedClientInfo {
	readonly generator: string
	readonly clientFile?: string
	readonly outputFiles?: readonly string[]
	readonly generatedAt: string
}
