/**
 * Safely converts a value to string, handling symbols and other types
 */
export function safeToString(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'symbol') return value.description || 'Symbol'
	return String(value)
}

/**
 * Converts a string to camelCase
 */
export function camelCase(str: string): string {
	return str.charAt(0).toLowerCase() + str.slice(1)
}
