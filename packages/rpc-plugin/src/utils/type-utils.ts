import type { Type } from 'ts-morph'
import { BUILTIN_TYPES, GENERIC_TYPES } from '../constants/defaults'

/**
 * Returns true if the type name is synthetic/anonymous (e.g. compiler-generated
 * names for inline object types like `{ deleted: boolean }`).
 */
export function isSyntheticTypeName(typeName: string): boolean {
	return typeName.startsWith('__')
}

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

	// Skip anonymous/synthetic types (e.g. inline object types like { deleted: boolean })
	if (isSyntheticTypeName(name)) return null

	return name
}
