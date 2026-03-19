import { Project } from 'ts-morph'
import { describe, expect, it } from 'vitest'
import { extractNamedType, isSyntheticTypeName } from './type-utils'

function getParamType(source: string, paramIndex = 0) {
	const project = new Project({ useInMemoryFileSystem: true })
	const file = project.createSourceFile('test.ts', source)
	const fn = file.getFunction('f')
	const params = fn?.getParameters() ?? []
	const param = params[paramIndex]
	return param?.getType() ?? null
}

describe('type-utils', () => {
	describe('extractNamedType', () => {
		it('returns interface name from parameter type', () => {
			const type = getParamType(`
				interface User {
					id: string
				}
				function f(u: User) {}
			`)
			expect(type).not.toBeNull()
			expect(extractNamedType(type!)).toBe('User')
		})

		it('returns null for built-in string type', () => {
			const type = getParamType(`
				function f(s: string) {}
			`)
			expect(type).not.toBeNull()
			expect(extractNamedType(type!)).toBeNull()
		})

		it('returns null for built-in number type', () => {
			const type = getParamType(`
				function f(n: number) {}
			`)
			expect(type).not.toBeNull()
			expect(extractNamedType(type!)).toBeNull()
		})

		it('unwraps Promise and returns inner type name', () => {
			const type = getParamType(`
				interface Foo { x: number }
				function f(p: Promise<Foo>) {}
			`)
			expect(type).not.toBeNull()
			expect(extractNamedType(type!)).toBe('Foo')
		})

		it('unwraps Array and returns inner type name', () => {
			const type = getParamType(`
				interface Bar { y: string }
				function f(a: Array<Bar>) {}
			`)
			expect(type).not.toBeNull()
			expect(extractNamedType(type!)).toBe('Bar')
		})

		it('returns null for anonymous/synthetic types (e.g. __type)', () => {
			const type = getParamType(`
				function f(x: { deleted: boolean }) {}
			`)
			expect(type).not.toBeNull()
			// Inline object types may be reported as __type by the compiler
			const name = extractNamedType(type!)
			expect(name === null || !isSyntheticTypeName(name)).toBe(true)
		})
	})

	describe('isSyntheticTypeName', () => {
		it('returns true for names starting with __', () => {
			expect(isSyntheticTypeName('__type')).toBe(true)
			expect(isSyntheticTypeName('__object')).toBe(true)
		})

		it('returns false for normal type names', () => {
			expect(isSyntheticTypeName('User')).toBe(false)
			expect(isSyntheticTypeName('CreateTodoDto')).toBe(false)
		})
	})
})
