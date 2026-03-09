import type { Type } from 'ts-morph'
import { BUILTIN_TYPES, GENERIC_TYPES } from '../constants/defaults'

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
