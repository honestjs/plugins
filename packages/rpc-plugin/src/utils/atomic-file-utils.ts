import { basename, dirname, join } from 'path'
import { mkdir, rename, rm, writeFile } from 'fs/promises'

function makeTempPath(targetPath: string): string {
	return join(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`)
}

/**
 * Atomically writes file content by writing to a temporary file and renaming.
 */
export async function writeFileAtomic(targetPath: string, content: string): Promise<void> {
	await mkdir(dirname(targetPath), { recursive: true })
	const tempPath = makeTempPath(targetPath)

	try {
		await writeFile(tempPath, content, 'utf-8')
		await rename(tempPath, targetPath)
	} catch (error) {
		await rm(tempPath, { force: true }).catch(() => undefined)
		throw error
	}
}

export async function writeJsonAtomic(targetPath: string, value: unknown, pretty = true): Promise<void> {
	const serialized = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)
	await writeFileAtomic(targetPath, serialized)
}
