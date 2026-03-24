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
			return `{\n${generateTypeScriptInterfaceProperties(schema)}}`
		default:
			if (schema?.$ref) {
				return schema?.$ref.replace('#/definitions/', '')
			}
			return 'any'
	}
}

/**
 * Generates TypeScript interface or type alias from JSON schema
 */
export function generateTypeScriptInterface(typeName: string, schema: Record<string, any>): string {
	try {
		// Use definition when present; otherwise use root schema only if there are no definitions (root-level type)
		const typeDefinition = schema.definitions?.[typeName] ?? (schema.definitions === undefined ? schema : undefined)
		if (!typeDefinition) {
			return `export interface ${typeName} {\n\t// No schema definition found\n}`
		}

		// Type alias for string union / enum (e.g. type TodoStatus = 'todo' | 'in_progress' | 'done')
		if (typeDefinition.type === 'string' && typeDefinition.enum && Array.isArray(typeDefinition.enum)) {
			const union = (typeDefinition.enum as string[])
				.map((s) => `'${String(s).replace(/'/g, "\\'")}'`)
				.join(' | ')
			return `export type ${typeName} = ${union}`
		}

		let interfaceCode = `export interface ${typeName} {\n`

		interfaceCode += generateTypeScriptInterfaceProperties(typeDefinition)
		interfaceCode += '}'
		return interfaceCode
	} catch (error) {
		console.error(`Failed to generate TypeScript interface for ${typeName}:`, error)
		return `export interface ${typeName} {\n\t// Failed to generate interface\n}`
	}
}

export function generateTypeScriptInterfaceProperties(schema: Record<string, any>): string {
	const properties = schema.properties || {}
	const required = schema.required || []

	let interfaceCode = ''

	for (const [propName, propSchema] of Object.entries(properties)) {
		const isRequired = required.includes(propName)
		const type = mapJsonSchemaTypeToTypeScript(propSchema as Record<string, any>)
		const optional = isRequired ? '' : '?'

		interfaceCode += `\t${propName}${optional}: ${type}\n`
	}

	return interfaceCode
}
