import type { ControllerGroups, ExtendedRouteInfo } from '../types/route.types'
import { buildFullApiPath } from '../utils/path-utils'
import { safeToString } from '../utils/string-utils'

/**
 * Groups analyzed routes by controller.
 */
export function groupRoutesByController(routes: readonly ExtendedRouteInfo[]): ControllerGroups {
	const groups = new Map<string, ExtendedRouteInfo[]>()

	for (const route of routes) {
		const controller = safeToString(route.controller)
		if (!groups.has(controller)) {
			groups.set(controller, [])
		}
		groups.get(controller)!.push(route)
	}

	return groups
}

/**
 * Builds a normalized request path where parameter placeholders are rewritten
 * to use parameter names inferred by analysis.
 */
export function buildNormalizedRequestPath(route: ExtendedRouteInfo): string {
	let requestPath = buildFullApiPath(route)

	for (const parameter of route.parameters ?? []) {
		if (parameter.decoratorType !== 'param') continue

		const placeholder = `:${String(parameter.data ?? parameter.name)}`
		requestPath = requestPath.replace(placeholder, `:${parameter.name}`)
	}

	return requestPath
}
