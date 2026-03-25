/**
 * Maps JSON schema types to TypeScript types
 */
export function mapJsonSchemaTypeToTypeScript(schema: Record<string, any>, indentation = '\t'): string {
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
			const itemType = mapJsonSchemaTypeToTypeScript(schema.items || {}, indentation)
			return `${itemType}[]`
		}
		case 'object': {
			const hasProperties = Object.keys(schema.properties || {}).length > 0
			const objectLiteral = `{\n${generateTypeScriptInterfaceProperties(schema, `${indentation}\t`)}${indentation}}`
			const additional = schema.additionalProperties

			// Keep open object semantics for map/dictionary schemas.
			if (additional !== undefined && additional !== false) {
				const additionalType =
					additional === true
						? 'unknown'
						: mapJsonSchemaTypeToTypeScript(additional as Record<string, any>, indentation)
				const recordType = `Record<string, ${additionalType}>`
				return hasProperties ? `${objectLiteral} & ${recordType}` : recordType
			}

			if (additional === false) {
				return hasProperties ? objectLiteral : 'Record<string, never>'
			}

			// additionalProperties omitted: treat empty object as open dictionary.
			return hasProperties ? objectLiteral : 'Record<string, unknown>'
		}
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

export function generateTypeScriptInterfaceProperties(schema: Record<string, any>, indentation = '\t'): string {
	const properties = schema.properties || {}
	const required = schema.required || []

	let interfaceCode = ''

	for (const [propName, propSchema] of Object.entries(properties)) {
		const isRequired = required.includes(propName)
		const type = mapJsonSchemaTypeToTypeScript(propSchema as Record<string, any>, indentation)
		const optional = isRequired ? '' : '?'

		interfaceCode += `${indentation}${propName}${optional}: ${type}\n`
	}

	return interfaceCode
}
