import { describe, expect, it } from 'vitest'
import { camelCase, safeToString } from './string-utils'

describe('string-utils', () => {
	describe('safeToString', () => {
		it('returns string unchanged', () => {
			expect(safeToString('hello')).toBe('hello')
			expect(safeToString('')).toBe('')
		})

		it('converts number to string', () => {
			expect(safeToString(42)).toBe('42')
		})

		it('converts symbol to description when present', () => {
			expect(safeToString(Symbol('myDesc'))).toBe('myDesc')
		})

		it('returns "Symbol" for symbol without description', () => {
			expect(safeToString(Symbol())).toBe('Symbol')
		})

		it('converts object to string', () => {
			expect(safeToString({})).toBe('[object Object]')
		})
	})

	describe('camelCase', () => {
		it('lowercases first character', () => {
			expect(camelCase('Hello')).toBe('hello')
		})

		it('leaves rest unchanged', () => {
			expect(camelCase('GetById')).toBe('getById')
		})
	})
})
