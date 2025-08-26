/**
 * Schema with comprehensive type information
 */
export interface SchemaInfo {
	readonly type: string
	readonly schema: Record<string, any>
	readonly typescriptType?: string
}

/**
 * Generated client file information
 */
export interface GeneratedClientInfo {
	readonly clientFile: string
	readonly generatedAt: string
}
