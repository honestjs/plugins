import type { ExtendedRouteInfo, RpcArtifact, SchemaInfo } from '../types'

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

export type ParsedRpcArtifact = {
	routes: ExtendedRouteInfo[]
	schemas: SchemaInfo[]
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExtendedRouteInfo(value: unknown): value is ExtendedRouteInfo {
	if (!isObject(value)) {
		return false
	}

	return (
		typeof value.controller === 'string' &&
		typeof value.handler === 'string' &&
		typeof value.method === 'string' &&
		typeof value.fullPath === 'string'
	)
}

function isSchemaInfo(value: unknown): value is SchemaInfo {
	if (!isObject(value)) {
		return false
	}

	return typeof value.type === 'string' && isObject(value.schema)
}

function parseLegacyArtifact(value: unknown): ParsedRpcArtifact | null {
	if (!isObject(value)) {
		return null
	}

	if (!Array.isArray(value.routes) || !Array.isArray(value.schemas)) {
		return null
	}

	if (!value.routes.every(isExtendedRouteInfo) || !value.schemas.every(isSchemaInfo)) {
		return null
	}

	return {
		routes: [...value.routes],
		schemas: [...value.schemas]
	}
}

function parseVersionedArtifact(value: unknown): ParsedRpcArtifact | null {
	try {
		assertRpcArtifact(value)
	} catch {
		return null
	}

	if (!value.routes.every(isExtendedRouteInfo) || !value.schemas.every(isSchemaInfo)) {
		return null
	}

	return {
		routes: [...value.routes],
		schemas: [...value.schemas]
	}
}

export function parseRpcArtifact(value: unknown): ParsedRpcArtifact | null {
	if (!isObject(value)) {
		return null
	}

	if (value.artifactVersion === undefined) {
		return parseLegacyArtifact(value)
	}

	return parseVersionedArtifact(value)
}
