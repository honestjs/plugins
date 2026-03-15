import type { RpcArtifact } from '../types'

export const RPC_ARTIFACT_VERSION = '1'

export function isRpcArtifact(value: unknown): value is RpcArtifact {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const obj = value as Record<string, unknown>
	return typeof obj.artifactVersion === 'string' && Array.isArray(obj.routes) && Array.isArray(obj.schemas)
}

export function assertRpcArtifact(value: unknown): asserts value is RpcArtifact {
	if (!isRpcArtifact(value)) {
		throw new Error('Invalid RPC artifact: expected { artifactVersion, routes, schemas }')
	}
	if (value.artifactVersion !== RPC_ARTIFACT_VERSION) {
		throw new Error(
			`Unsupported RPC artifact version '${value.artifactVersion}'. Supported: ${RPC_ARTIFACT_VERSION}.`
		)
	}
}
