import { RouteRegistry, type ParameterMetadata, type RouteInfo } from 'honestjs'
import { ClassDeclaration, MethodDeclaration, Project } from 'ts-morph'
import { LOG_PREFIX } from '../constants/defaults'
import type { ExtendedRouteInfo, ParameterMetadataWithType } from '../types/route.types'
import { buildFullApiPath } from '../utils/path-utils'
import { safeToString } from '../utils/string-utils'

/**
 * Service for analyzing controller methods and extracting type information
 */
export class RouteAnalyzerService {
	/**
	 * Analyzes controller methods to extract type information
	 */
	async analyzeControllerMethods(project: Project): Promise<ExtendedRouteInfo[]> {
		const routes = RouteRegistry.getRoutes()
		if (!routes?.length) {
			return []
		}

		const controllers = this.findControllerClasses(project)

		if (controllers.size === 0) {
			return []
		}

		return this.processRoutes(routes, controllers)
	}

	/**
	 * Finds controller classes in the project
	 */
	private findControllerClasses(project: Project): Map<string, ClassDeclaration> {
		const controllers = new Map<string, ClassDeclaration>()
		const files = project.getSourceFiles()

		for (const sourceFile of files) {
			const classes = sourceFile.getClasses()

			for (const classDeclaration of classes) {
				const className = classDeclaration.getName()

				if (className?.endsWith('Controller')) {
					controllers.set(className, classDeclaration)
				}
			}
		}

		return controllers
	}

	/**
	 * Processes all routes and extracts type information
	 */
	private processRoutes(
		routes: readonly RouteInfo[],
		controllers: Map<string, ClassDeclaration>
	): ExtendedRouteInfo[] {
		const analyzedRoutes: ExtendedRouteInfo[] = []

		for (const route of routes) {
			try {
				const extendedRoute = this.createExtendedRoute(route, controllers)
				analyzedRoutes.push(extendedRoute)
			} catch (routeError) {
				console.warn(
					`${LOG_PREFIX} Skipping route ${safeToString(route.controller)}.${safeToString(route.handler)}:`,
					routeError
				)
			}
		}

		return analyzedRoutes
	}

	/**
	 * Creates an extended route with type information
	 */
	private createExtendedRoute(route: RouteInfo, controllers: Map<string, ClassDeclaration>): ExtendedRouteInfo {
		const controllerName = safeToString(route.controller)
		const handlerName = safeToString(route.handler)

		const controllerClass = controllers.get(controllerName)
		let returns: string | undefined
		let parameters: readonly ParameterMetadataWithType[] | undefined

		if (controllerClass) {
			const handlerMethod = controllerClass.getMethods().find((method) => method.getName() === handlerName)

			if (handlerMethod) {
				returns = this.getReturnType(handlerMethod)
				parameters = this.getParametersWithTypes(handlerMethod, route.parameters || [])
			}
		}

		return {
			controller: controllerName,
			handler: handlerName,
			method: safeToString(route.method).toUpperCase(),
			prefix: route.prefix,
			version: route.version,
			route: route.route,
			path: route.path,
			fullPath: buildFullApiPath(route),
			parameters,
			returns
		}
	}

	/**
	 * Gets the return type of a method
	 */
	private getReturnType(method: MethodDeclaration): string {
		const type = method.getReturnType()
		const typeText = type.getText(method)

		const aliasSymbol = type.getAliasSymbol()
		if (aliasSymbol) {
			return aliasSymbol.getName()
		}

		return typeText.replace(/import\(".*?"\)\./g, '')
	}

	/**
	 * Gets parameters with their types
	 */
	private getParametersWithTypes(
		method: MethodDeclaration,
		parameters: readonly ParameterMetadata[]
	): readonly ParameterMetadataWithType[] {
		const result: ParameterMetadataWithType[] = []
		const declaredParams = method.getParameters()
		const sortedParams = [...parameters].sort((a, b) => a.index - b.index)

		for (const param of sortedParams) {
			const index = param.index
			const decoratorType = param.name

			if (index < declaredParams.length) {
				const declaredParam = declaredParams[index]
				const paramName = declaredParam.getName()
				const paramType = declaredParam
					.getType()
					.getText()
					.replace(/import\(".*?"\)\./g, '')

				result.push({
					index,
					name: paramName,
					decoratorType,
					type: paramType,
					required: true,
					data: param.data,
					factory: param.factory,
					metatype: param.metatype
				})
			} else {
				result.push({
					index,
					name: `param${index}`,
					decoratorType,
					type: param.metatype?.name || 'unknown',
					required: true,
					data: param.data,
					factory: param.factory,
					metatype: param.metatype
				})
			}
		}

		return result
	}
}
