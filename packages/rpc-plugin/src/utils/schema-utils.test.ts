import { describe, expect, it } from 'vitest'
import { generateTypeScriptInterface, mapJsonSchemaTypeToTypeScript } from './schema-utils'

describe('schema-utils', () => {
	describe('mapJsonSchemaTypeToTypeScript', () => {
		it('maps string type', () => {
			expect(mapJsonSchemaTypeToTypeScript({ type: 'string' })).toBe('string')
		})

		it('maps number and integer to number', () => {
			expect(mapJsonSchemaTypeToTypeScript({ type: 'number' })).toBe('number')
			expect(mapJsonSchemaTypeToTypeScript({ type: 'integer' })).toBe('number')
		})

		it('maps boolean type', () => {
			expect(mapJsonSchemaTypeToTypeScript({ type: 'boolean' })).toBe('boolean')
		})

		it('maps array with items', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'array',
					items: { type: 'string' }
				})
			).toBe('string[]')
		})

		it('maps object type', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'object',
					properties: {
						id: { type: 'number' },
						name: { type: 'string' }
					},
					required: ['id'],
					additionalProperties: false
				})
			).toBe('{\n\t\tid: number\n\t\tname?: string\n\t}')
		})

		it('maps dictionary object type from additionalProperties schema', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'object',
					additionalProperties: { type: 'string' }
				})
			).toBe('Record<string, string>')
		})

		it('maps dictionary object type from additionalProperties=true', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'object',
					additionalProperties: true
				})
			).toBe('Record<string, unknown>')
		})

		it('maps object with known properties and additionalProperties', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'object',
					properties: {
						id: { type: 'number' }
					},
					required: ['id'],
					additionalProperties: { type: 'string' }
				})
			).toBe('{\n\t\tid: number\n\t} & Record<string, string>')
		})

		it('maps empty object schema to open dictionary when additionalProperties is omitted', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'object'
				})
			).toBe('Record<string, unknown>')
		})

		it('maps additionalProperties=false with no properties to Record<string, never>', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'object',
					additionalProperties: false
				})
			).toBe('Record<string, never>')
		})

		it('returns any for unknown or missing type', () => {
			expect(mapJsonSchemaTypeToTypeScript({})).toBe('any')
			expect(mapJsonSchemaTypeToTypeScript({ type: 'unknown' })).toBe('any')
		})

		it('maps string enum to union', () => {
			expect(
				mapJsonSchemaTypeToTypeScript({
					type: 'string',
					enum: ['a', 'b']
				})
			).toBe("'a' | 'b'")
		})
	})

	describe('generateTypeScriptInterface', () => {
		it('generates interface from definitions with properties and required', () => {
			const schema = {
				definitions: {
					User: {
						properties: {
							id: { type: 'string' },
							name: { type: 'string' }
						},
						required: ['id']
					}
				}
			}
			const result = generateTypeScriptInterface('User', schema)
			expect(result).toContain('export interface User {')
			expect(result).toContain('id: string')
			expect(result).toContain('name?: string')
		})

		it('returns fallback when definition is missing', () => {
			const result = generateTypeScriptInterface('Missing', {
				definitions: {}
			})
			expect(result).toContain('export interface Missing {')
			expect(result).toContain('No schema definition found')
		})

		it('returns fallback on invalid schema', () => {
			const result = generateTypeScriptInterface('Foo', null as any)
			expect(result).toContain('export interface Foo {')
			expect(result).toContain('Failed to generate interface')
		})

		it('generates type alias for string enum in definitions', () => {
			const schema = {
				definitions: {
					TodoStatus: {
						type: 'string',
						enum: ['todo', 'in_progress', 'done']
					}
				}
			}
			const result = generateTypeScriptInterface('TodoStatus', schema)
			expect(result).toBe("export type TodoStatus = 'todo' | 'in_progress' | 'done'")
		})
	})
})
