import type { ParameterMetadata, RouteInfo } from 'honestjs'
import { ClassDeclaration, MethodDeclaration, Project } from 'ts-morph'
import type { ExtendedRouteInfo, ParameterMetadataWithType } from '../types/route.types'
import { buildFullApiPath } from '../utils/path-utils'
import { isSyntheticTypeName } from '../utils/type-utils'
import { safeToString } from '../utils/string-utils'

export interface RouteAnalyzerOptions {
	readonly customClassMatcher?: (classDeclaration: ClassDeclaration) => boolean
	readonly onWarn?: (message: string, details?: unknown) => void
}

/**
 * Service for analyzing controller methods and extracting type information
 */
export class RouteAnalyzerService {
	private readonly customClassMatcher?: (classDeclaration: ClassDeclaration) => boolean
	private readonly onWarn?: (message: string, details?: unknown) => void
	private warnings: string[] = []

	constructor(options: RouteAnalyzerOptions = {}) {
		this.customClassMatcher = options.customClassMatcher
		this.onWarn = options.onWarn
	}

	getWarnings(): readonly string[] {
		return this.warnings
	}

	/**
	 * Analyzes controller methods to extract type information.
	 * @param project - ts-morph project with source files loaded
	 * @param routes - registered routes from `app.getRoutes()`
	 */
	async analyzeControllerMethods(project: Project, routes: ReadonlyArray<RouteInfo>): Promise<ExtendedRouteInfo[]> {
		this.warnings = []
		if (!routes?.length) {
			return []
		}

		const controllers = this.findControllerClasses(project)
		return this.analyzeControllerMethodsWithControllers(routes, controllers)
	}

	/**
	 * Analyzes controller methods with precomputed controller map.
	 */
	async analyzeControllerMethodsWithControllers(
		routes: ReadonlyArray<RouteInfo>,
		controllers: ReadonlyMap<string, ClassDeclaration>
	): Promise<ExtendedRouteInfo[]> {
		this.warnings = []
		if (!routes?.length) {
			return []
		}

		if (controllers.size === 0) {
			return []
		}

		return this.processRoutes(routes, new Map(controllers))
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

				if (className && this.isControllerClass(classDeclaration, className)) {
					controllers.set(className, classDeclaration)
				}
			}
		}

		return controllers
	}

	private isControllerClass(classDeclaration: ClassDeclaration, _className: string): boolean {
		if (this.customClassMatcher) {
			return this.customClassMatcher(classDeclaration)
		}
		const decoratorNames = classDeclaration.getDecorators().map((decorator) => decorator.getName())
		return decoratorNames.includes('Controller') || decoratorNames.includes('View')
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
				const warning = `Skipping route ${safeToString(route.controller)}.${safeToString(route.handler)}`
				this.warnings.push(warning)
				this.onWarn?.(warning, routeError)
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
		} else {
			const warning = `Controller class not found in source files: ${controllerName} (handler: ${handlerName})`
			this.warnings.push(warning)
			this.onWarn?.(warning)
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
			const name = aliasSymbol.getName()
			// Use type text for anonymous/inline types (e.g. { deleted: boolean })
			// so the client gets the real shape instead of "__type"
			if (isSyntheticTypeName(name)) {
				return typeText.replace(/import\(".*?"\)\./g, '')
			}
			return name
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
