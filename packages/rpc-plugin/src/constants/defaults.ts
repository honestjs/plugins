/**
 * Default configuration options for the RPCPlugin
 */
export const DEFAULT_OPTIONS = {
	controllerPattern: 'src/modules/*/*.controller.ts',
	tsConfigPath: 'tsconfig.json',
	outputDir: './generated/rpc',
	generateOnInit: true
} as const

/**
 * Log prefix for the RPC plugin
 */
export const LOG_PREFIX = '[ RPCPlugin ]'

/**
 * Built-in TypeScript types that should not be imported
 */
export const BUILTIN_UTILITY_TYPES = new Set([
	'Partial',
	'Required',
	'Readonly',
	'Pick',
	'Omit',
	'Record',
	'Exclude',
	'Extract',
	'ReturnType',
	'InstanceType'
])

/**
 * Built-in TypeScript types that should be skipped
 */
export const BUILTIN_TYPES = new Set(['string', 'number', 'boolean', 'any', 'void', 'unknown'])

/**
 * Generic type names that should be unwrapped
 */
export const GENERIC_TYPES = new Set(['Array', 'Promise', 'Partial'])
