import type { Type } from 'ts-morph'
import { BUILTIN_TYPES, BUILTIN_UTILITY_TYPES, GENERIC_TYPES } from '../constants/defaults'

/**
 * Extracts a named type from a TypeScript type
 */
export function extractNamedType(type: Type): string | null {
	const symbol = type.getAliasSymbol() || type.getSymbol()
	if (!symbol) return null

	const name = symbol.getName()

	// Handle generic types by unwrapping them
	if (GENERIC_TYPES.has(name)) {
		const inner = type.getAliasTypeArguments()?.[0] || type.getTypeArguments()?.[0]
		return inner ? extractNamedType(inner) : null
	}

	// Skip built-in types
	if (BUILTIN_TYPES.has(name)) return null

	return name
}

/**
 * Generates type imports for the client
 */
export function generateTypeImports(routes: readonly any[]): string {
	const types = new Set<string>()

	for (const route of routes) {
		// Collect parameter types
		if (route.parameters) {
			for (const param of route.parameters) {
				if (param.type && !['string', 'number', 'boolean'].includes(param.type)) {
					// Extract type name from complex types like Partial<CreateUserDto> or User[]
					const typeMatch = param.type.match(/(\w+)(?:<.*>)?/)
					if (typeMatch) {
						const typeName = typeMatch[1]
						// Don't import built-in TypeScript utility types
						if (!BUILTIN_UTILITY_TYPES.has(typeName)) {
							types.add(typeName)
						}
					}
				}
			}
		}

		// Collect return types
		if (route.returns) {
			const returnType = route.returns.replace(/Promise<(.+)>/, '$1')
			// Extract base type name from array types (e.g., 'User[]' -> 'User')
			const baseType = returnType.replace(/\[\]$/, '')
			if (!['string', 'number', 'boolean', 'any', 'void', 'unknown'].includes(baseType)) {
				types.add(baseType)
			}
		}
	}

	return Array.from(types).join(', ')
}
