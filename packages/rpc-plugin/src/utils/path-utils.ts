import type { ParameterMetadata } from 'honestjs'
import type { ExtendedRouteInfo } from '../types/route.types'

/**
 * Builds the full path with parameter placeholders
 */
export function buildFullPath(basePath: string, parameters: readonly ParameterMetadata[]): string {
	if (!basePath || typeof basePath !== 'string') return '/'

	let path = basePath

	if (parameters && Array.isArray(parameters)) {
		for (const param of parameters) {
			if (param.data && typeof param.data === 'string' && param.data.startsWith(':')) {
				const paramName = param.data.slice(1)
				path = path.replace(`:${paramName}`, `\${${paramName}}`)
			}
		}
	}

	return path
}

/**
 * Builds the full API path using route information
 */
export function buildFullApiPath(route: ExtendedRouteInfo): string {
	const prefix = route.prefix || ''
	const version = route.version || ''
	const routePath = route.route || ''
	const path = route.path || ''

	let fullPath = ''

	// Add prefix (e.g., /api)
	if (prefix && prefix !== '/') {
		fullPath += prefix.replace(/^\/+|\/+$/g, '')
	}

	// Add version (e.g., /v1)
	if (version && version !== '/') {
		fullPath += `/${version.replace(/^\/+|\/+$/g, '')}`
	}

	// Add route (e.g., /users)
	if (routePath && routePath !== '/') {
		fullPath += `/${routePath.replace(/^\/+|\/+$/g, '')}`
	}

	// Add path (e.g., /:id or /)
	if (path && path !== '/') {
		fullPath += `/${path.replace(/^\/+|\/+$/g, '')}`
	} else if (path === '/') {
		fullPath += '/'
	}

	return fullPath || '/'
}
