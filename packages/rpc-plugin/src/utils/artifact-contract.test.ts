import { describe, expect, it } from 'vitest'
import { isRpcArtifact, assertRpcArtifact, RPC_ARTIFACT_VERSION } from './artifact-contract'

describe('artifact-contract', () => {
	describe('RPC_ARTIFACT_VERSION', () => {
		it('is "1"', () => {
			expect(RPC_ARTIFACT_VERSION).toBe('1')
		})
	})

	describe('isRpcArtifact', () => {
		it('returns true for valid artifact', () => {
			expect(isRpcArtifact({ artifactVersion: '1', routes: [], schemas: [] })).toBe(true)
		})

		it('returns false for null', () => {
			expect(isRpcArtifact(null)).toBe(false)
		})

		it('returns false for undefined', () => {
			expect(isRpcArtifact(undefined)).toBe(false)
		})

		it('returns false for primitives', () => {
			expect(isRpcArtifact('string')).toBe(false)
			expect(isRpcArtifact(42)).toBe(false)
			expect(isRpcArtifact(true)).toBe(false)
		})

		it('returns false for arrays', () => {
			expect(isRpcArtifact([])).toBe(false)
		})

		it('returns false when artifactVersion is missing', () => {
			expect(isRpcArtifact({ routes: [], schemas: [] })).toBe(false)
		})

		it('returns false when artifactVersion is not a string', () => {
			expect(isRpcArtifact({ artifactVersion: 1, routes: [], schemas: [] })).toBe(false)
		})

		it('returns false when routes is not an array', () => {
			expect(isRpcArtifact({ artifactVersion: '1', routes: 'not array', schemas: [] })).toBe(false)
		})

		it('returns false when schemas is not an array', () => {
			expect(isRpcArtifact({ artifactVersion: '1', routes: [], schemas: {} })).toBe(false)
		})

		it('returns false for empty object', () => {
			expect(isRpcArtifact({})).toBe(false)
		})

		it('returns true for any string artifactVersion (type guard only checks shape)', () => {
			expect(isRpcArtifact({ artifactVersion: '99', routes: [], schemas: [] })).toBe(true)
		})
	})

	describe('assertRpcArtifact', () => {
		it('does not throw for valid artifact with version "1"', () => {
			expect(() => assertRpcArtifact({ artifactVersion: '1', routes: [], schemas: [] })).not.toThrow()
		})

		it('throws for invalid shape', () => {
			expect(() => assertRpcArtifact(null)).toThrow('Invalid RPC artifact')
			expect(() => assertRpcArtifact({})).toThrow('Invalid RPC artifact')
			expect(() => assertRpcArtifact({ routes: [] })).toThrow('Invalid RPC artifact')
		})

		it('throws for unsupported artifact version', () => {
			expect(() => assertRpcArtifact({ artifactVersion: '2', routes: [], schemas: [] })).toThrow(
				"Unsupported RPC artifact version '2'"
			)
		})

		it('includes supported version in error message', () => {
			try {
				assertRpcArtifact({ artifactVersion: '99', routes: [], schemas: [] })
			} catch (e: any) {
				expect(e.message).toContain(RPC_ARTIFACT_VERSION)
			}
		})
	})
})
