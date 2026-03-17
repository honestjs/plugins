import type { ControllerGroups, ExtendedRouteInfo } from '../types/route.types'
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
