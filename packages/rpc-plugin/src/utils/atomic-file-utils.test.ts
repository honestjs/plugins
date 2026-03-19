import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { writeFileAtomic, writeJsonAtomic } from './atomic-file-utils'

describe('atomic-file-utils', () => {
	it('writeFileAtomic writes file content', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-atomic-'))
		const targetPath = path.join(dir, 'artifact.json')

		try {
			await writeFileAtomic(targetPath, '{"ok":true}')
			expect(fs.existsSync(targetPath)).toBe(true)
			expect(fs.readFileSync(targetPath, 'utf-8')).toBe('{"ok":true}')
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it('writeJsonAtomic writes formatted json by default', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-atomic-'))
		const targetPath = path.join(dir, 'diagnostics.json')

		try {
			await writeJsonAtomic(targetPath, { status: 'ok' })
			expect(fs.existsSync(targetPath)).toBe(true)
			const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
			expect(parsed).toEqual({ status: 'ok' })
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it('does not leave temp files after successful write', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-atomic-'))
		const targetPath = path.join(dir, 'checksum.json')

		try {
			await writeJsonAtomic(targetPath, { hash: 'abc' }, false)
			const files = fs.readdirSync(dir)
			expect(files).toEqual(['checksum.json'])
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})
