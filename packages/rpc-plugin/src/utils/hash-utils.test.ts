import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { computeHash, readChecksum, writeChecksum } from './hash-utils'

describe('hash-utils', () => {
	describe('computeHash', () => {
		it('returns deterministic hash for empty array', () => {
			const a = computeHash([])
			const b = computeHash([])
			expect(a).toBe(b)
			expect(typeof a).toBe('string')
			expect(a).toMatch(/^[a-f0-9]{64}$/)
		})

		it('returns same hash for same file content regardless of path order', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			const fileA = path.join(dir, 'a.ts')
			const fileB = path.join(dir, 'b.ts')
			fs.writeFileSync(fileA, 'const x = 1', 'utf-8')
			fs.writeFileSync(fileB, 'const x = 1', 'utf-8')
			try {
				const hashBA = computeHash([fileB, fileA])
				const hashAB = computeHash([fileA, fileB])
				expect(hashBA).toBe(hashAB)
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})

		it('returns different hash for different content', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			const fileA = path.join(dir, 'a.ts')
			const fileB = path.join(dir, 'b.ts')
			fs.writeFileSync(fileA, 'const x = 1', 'utf-8')
			fs.writeFileSync(fileB, 'const x = 2', 'utf-8')
			try {
				const hashA = computeHash([fileA])
				const hashB = computeHash([fileB])
				expect(hashA).not.toBe(hashB)
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})

		it('returns different hash when file count differs', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			const file1 = path.join(dir, 'one.ts')
			const file2 = path.join(dir, 'two.ts')
			fs.writeFileSync(file1, 'x', 'utf-8')
			fs.writeFileSync(file2, 'x', 'utf-8')
			try {
				const hashOne = computeHash([file1])
				const hashTwo = computeHash([file1, file2])
				expect(hashOne).not.toBe(hashTwo)
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})
	})

	describe('readChecksum', () => {
		it('returns null when file is missing', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			try {
				expect(readChecksum(dir)).toBeNull()
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})

		it('returns null for non-existent directory', () => {
			expect(readChecksum(path.join(os.tmpdir(), 'does-not-exist-xyz'))).toBeNull()
		})

		it('returns null for invalid JSON', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			fs.writeFileSync(path.join(dir, '.rpc-checksum'), 'not json', 'utf-8')
			try {
				expect(readChecksum(dir)).toBeNull()
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})

		it('returns null for wrong shape (empty object)', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			fs.writeFileSync(path.join(dir, '.rpc-checksum'), '{}', 'utf-8')
			try {
				expect(readChecksum(dir)).toBeNull()
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})

		it('returns null when hash is not a string', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			fs.writeFileSync(path.join(dir, '.rpc-checksum'), '{"hash":1,"files":[]}', 'utf-8')
			try {
				expect(readChecksum(dir)).toBeNull()
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})

		it('returns data for valid JSON with hash and files', () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			const data = { hash: 'abc123', files: ['/a.ts', '/b.ts'] }
			fs.writeFileSync(path.join(dir, '.rpc-checksum'), JSON.stringify(data), 'utf-8')
			try {
				const result = readChecksum(dir)
				expect(result).toEqual(data)
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})
	})

	describe('writeChecksum', () => {
		it('writes then readChecksum round-trips', async () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-test-'))
			const data = {
				hash: 'deadbeef',
				files: ['/src/a.ts', '/src/b.ts'],
				artifactVersion: '1',
				analysisHash: 'a'.repeat(64),
				generatorsHash: 'b'.repeat(64)
			}
			try {
				await writeChecksum(dir, data)
				const read = readChecksum(dir)
				expect(read).toEqual(data)
			} finally {
				fs.rmSync(dir, { recursive: true })
			}
		})
	})
})
