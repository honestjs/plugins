import { ClassDeclaration, MethodDeclaration, SourceFile } from 'ts-morph'
import { extractNamedTypes } from '../utils/type-utils'

export interface AnalysisGraph {
	readonly sourceFiles: readonly SourceFile[]
	readonly controllers: ReadonlyMap<string, ClassDeclaration>
	readonly collectedTypes: ReadonlySet<string>
}

export interface AnalysisGraphOptions {
	readonly customClassMatcher?: (classDeclaration: ClassDeclaration) => boolean
}

/**
 * Builds a reusable analysis graph from controller sources in a single traversal.
 */
export class AnalysisGraphService {
	private readonly customClassMatcher?: (classDeclaration: ClassDeclaration) => boolean

	constructor(options: AnalysisGraphOptions = {}) {
		this.customClassMatcher = options.customClassMatcher
	}

	build(sourceFiles: readonly SourceFile[]): AnalysisGraph {
		const controllers = new Map<string, ClassDeclaration>()
		const collectedTypes = new Set<string>()

		for (const sourceFile of sourceFiles) {
			for (const classDeclaration of sourceFile.getClasses()) {
				const className = classDeclaration.getName()
				if (!className || !this.isControllerClass(classDeclaration)) {
					continue
				}

				controllers.set(className, classDeclaration)

				for (const method of classDeclaration.getMethods()) {
					this.collectTypesFromMethod(method, collectedTypes)
				}
			}
		}

		return {
			sourceFiles,
			controllers,
			collectedTypes
		}
	}

	private isControllerClass(classDeclaration: ClassDeclaration): boolean {
		if (this.customClassMatcher) {
			return this.customClassMatcher(classDeclaration)
		}

		const decoratorNames = classDeclaration.getDecorators().map((decorator) => decorator.getName())
		return decoratorNames.includes('Controller') || decoratorNames.includes('View')
	}

	private collectTypesFromMethod(method: MethodDeclaration, collectedTypes: Set<string>): void {
		for (const param of method.getParameters()) {
			for (const name of extractNamedTypes(param.getType())) {
				collectedTypes.add(name)
			}
		}

		const returnType = method.getReturnType()
		const innerType = returnType.getTypeArguments()[0] ?? returnType
		for (const name of extractNamedTypes(innerType)) {
			collectedTypes.add(name)
		}
	}
}
