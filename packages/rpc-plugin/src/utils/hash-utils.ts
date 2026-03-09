import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const CHECKSUM_FILENAME = '.rpc-checksum'

export interface ChecksumData {
	hash: string
	files: string[]
}

/**
 * Computes a deterministic SHA-256 hash from file contents.
 * Sorts paths before reading to ensure consistent ordering.
 * Includes the file count in the hash so adding/removing files changes it.
 */
export function computeHash(filePaths: string[]): string {
	const sorted = [...filePaths].sort()
	const hasher = createHash('sha256')

	hasher.update(`files:${sorted.length}\n`)

	for (const filePath of sorted) {
		hasher.update(readFileSync(filePath, 'utf-8'))
		hasher.update('\0')
	}

	return hasher.digest('hex')
}

/**
 * Reads the stored checksum from the output directory.
 * Returns null if the file is missing or corrupt.
 */
export function readChecksum(outputDir: string): ChecksumData | null {
	const checksumPath = path.join(outputDir, CHECKSUM_FILENAME)

	if (!existsSync(checksumPath)) return null

	try {
		const raw = readFileSync(checksumPath, 'utf-8')
		const data = JSON.parse(raw) as ChecksumData

		if (typeof data.hash !== 'string' || !Array.isArray(data.files)) {
			return null
		}

		return data
	} catch {
		return null
	}
}

/**
 * Writes the checksum data to the output directory.
 */
export async function writeChecksum(outputDir: string, data: ChecksumData): Promise<void> {
	await mkdir(outputDir, { recursive: true })
	const checksumPath = path.join(outputDir, CHECKSUM_FILENAME)
	await writeFile(checksumPath, JSON.stringify(data, null, 2), 'utf-8')
}
