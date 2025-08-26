/**
 * Maps JSON schema types to TypeScript types
 */
export function mapJsonSchemaTypeToTypeScript(schema: Record<string, any>): string {
	const type = schema.type as string

	switch (type) {
		case 'string':
			if (schema.enum && Array.isArray(schema.enum)) {
				return `'${schema.enum.join("' | '")}'`
			}
			return 'string'
		case 'number':
		case 'integer':
			return 'number'
		case 'boolean':
			return 'boolean'
		case 'array': {
			const itemType = mapJsonSchemaTypeToTypeScript(schema.items || {})
			return `${itemType}[]`
		}
		case 'object':
			return 'Record<string, any>'
		default:
			return 'any'
	}
}

/**
 * Generates TypeScript interface from JSON schema
 */
export function generateTypeScriptInterface(typeName: string, schema: Record<string, any>): string {
	try {
		const typeDefinition = schema.definitions?.[typeName]
		if (!typeDefinition) {
			return `export interface ${typeName} {\n\t// No schema definition found\n}`
		}

		const properties = typeDefinition.properties || {}
		const required = typeDefinition.required || []

		let interfaceCode = `export interface ${typeName} {\n`

		for (const [propName, propSchema] of Object.entries(properties)) {
			const isRequired = required.includes(propName)
			const type = mapJsonSchemaTypeToTypeScript(propSchema as Record<string, any>)
			const optional = isRequired ? '' : '?'

			interfaceCode += `\t${propName}${optional}: ${type}\n`
		}

		interfaceCode += '}'
		return interfaceCode
	} catch (error) {
		console.error(`Failed to generate TypeScript interface for ${typeName}:`, error)
		return `export interface ${typeName} {\n\t// Failed to generate interface\n}`
	}
}
