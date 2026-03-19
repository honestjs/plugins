import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { writeJsonAtomic } from './atomic-file-utils'

const CHECKSUM_FILENAME = '.rpc-checksum'

export interface ChecksumData {
	hash: string
	files: string[]
	artifactVersion?: string
	analysisHash?: string
	generatorsHash?: string
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
 * Computes SHA-256 hash for an arbitrary string payload.
 */
export function computeContentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex')
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
		if (data.artifactVersion !== undefined && typeof data.artifactVersion !== 'string') {
			return null
		}
		if (data.analysisHash !== undefined && typeof data.analysisHash !== 'string') {
			return null
		}
		if (data.generatorsHash !== undefined && typeof data.generatorsHash !== 'string') {
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
	const checksumPath = path.join(outputDir, CHECKSUM_FILENAME)
	await writeJsonAtomic(checksumPath, data)
}
