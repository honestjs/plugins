import type { Application, IPlugin } from 'honestjs'
import type { Context, Hono, Next } from 'hono'

import { fromArtifactSync } from './openapi.generator'
import type { OpenApiArtifactInput, OpenApiGenerationOptions } from './openapi.generator'

const DEFAULT_OPENAPI_ROUTE = '/openapi.json'
const DEFAULT_UI_ROUTE = '/docs'
const DEFAULT_UI_TITLE = 'API Docs'
/** Default context key when using with RPC plugin (writes to this key). */
export const DEFAULT_ARTIFACT_KEY = 'rpc.artifact'

export type ArtifactInput = OpenApiArtifactInput | string

function isContextKey(artifact: ArtifactInput): artifact is string {
	return typeof artifact === 'string'
}

function isArtifact(value: unknown): value is OpenApiArtifactInput {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const obj = value as Record<string, unknown>
	return Array.isArray(obj.routes) && Array.isArray(obj.schemas)
}

export interface ApiDocsPluginOptions extends OpenApiGenerationOptions {
	/** Artifact: direct object `{ routes, schemas }` or context key string (e.g. `'rpc.artifact'`). Defaults to `'rpc.artifact'` when omitted. */
	readonly artifact?: ArtifactInput
	readonly openApiRoute?: string
	readonly uiRoute?: string
	readonly uiTitle?: string
	readonly reloadOnRequest?: boolean
	readonly onOpenApiRequest?: (c: Context, next: Next) => void | Response | Promise<void | Response>
	readonly onUiRequest?: (c: Context, next: Next) => void | Response | Promise<void | Response>
}

export class ApiDocsPlugin implements IPlugin {
	private readonly artifact: ArtifactInput
	private readonly openApiRoute: string
	private readonly uiRoute: string
	private readonly uiTitle: string
	private readonly reloadOnRequest: boolean
	private readonly genOptions: OpenApiGenerationOptions
	private readonly onOpenApiRequest?: (c: Context, next: Next) => void | Response | Promise<void | Response>
	private readonly onUiRequest?: (c: Context, next: Next) => void | Response | Promise<void | Response>

	private app: Application | null = null
	private cachedSpec: Record<string, unknown> | null = null

	constructor(options: ApiDocsPluginOptions = {}) {
		this.artifact = options.artifact ?? DEFAULT_ARTIFACT_KEY
		this.openApiRoute = this.normalizeRoute(options.openApiRoute ?? DEFAULT_OPENAPI_ROUTE)
		this.uiRoute = this.normalizeRoute(options.uiRoute ?? DEFAULT_UI_ROUTE)
		this.uiTitle = options.uiTitle ?? DEFAULT_UI_TITLE
		this.reloadOnRequest = options.reloadOnRequest ?? false
		this.onOpenApiRequest = options.onOpenApiRequest
		this.onUiRequest = options.onUiRequest
		this.genOptions = {
			title: options.title,
			version: options.version,
			description: options.description,
			servers: options.servers
		}
	}

	afterModulesRegistered = async (app: Application, hono: Hono): Promise<void> => {
		this.app = app

		hono.get(this.openApiRoute, async (c) => {
			try {
				const earlyResponse = await this.runHook(this.onOpenApiRequest, c)
				if (earlyResponse) return earlyResponse
				const spec = await this.resolveSpec()
				return c.json(spec)
			} catch (error) {
				return c.json(
					{
						error: 'Failed to load OpenAPI spec',
						message: this.toErrorMessage(error)
					},
					500
				)
			}
		})

		hono.get(this.uiRoute, async (c) => {
			const earlyResponse = await this.runHook(this.onUiRequest, c)
			if (earlyResponse) return earlyResponse
			return c.html(this.renderSwaggerUiHtml())
		})
	}

	private normalizeRoute(input: string): string {
		const trimmed = input.trim()
		if (!trimmed) return '/'
		let normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
		if (normalized.length > 1) {
			normalized = normalized.replace(/\/+$/g, '')
		}
		return normalized || '/'
	}

	private async resolveSpec(): Promise<Record<string, unknown>> {
		if (!this.reloadOnRequest && this.cachedSpec) {
			return this.cachedSpec
		}

		let artifact: OpenApiArtifactInput

		if (isContextKey(this.artifact)) {
			if (!this.app) {
				throw new Error('ApiDocsPlugin: app not available when resolving artifact from context')
			}
			const value = this.app.getContext().get<unknown>(this.artifact)
			if (value === undefined) {
				throw new Error(
					`ApiDocsPlugin: no artifact at context key '${this.artifact}'. Ensure RPC plugin (or another producer) runs before ApiDocs and writes to this key.`
				)
			}
			if (!isArtifact(value)) {
				throw new Error(
					`ApiDocsPlugin: value at '${this.artifact}' is not a valid artifact (expected object with routes and schemas)`
				)
			}
			artifact = value
		} else {
			artifact = this.artifact
		}

		const artifactVersion = (artifact as { artifactVersion?: unknown }).artifactVersion
		if (artifactVersion !== undefined && artifactVersion !== '1') {
			throw new Error(
				`ApiDocsPlugin: unsupported artifactVersion '${String(artifactVersion)}'. Supported versions: 1.`
			)
		}

		const spec = fromArtifactSync(artifact, this.genOptions) as unknown as Record<string, unknown>
		if (!this.reloadOnRequest) this.cachedSpec = spec
		return spec
	}

	private async runHook(
		hook: ((c: Context, next: Next) => void | Response | Promise<void | Response>) | undefined,
		c: Context
	): Promise<Response | undefined> {
		if (!hook) return undefined
		let nextCalled = false
		const maybeResponse = await hook(c, async () => {
			nextCalled = true
		})
		if (maybeResponse instanceof Response) {
			return maybeResponse
		}
		if (!nextCalled) {
			return new Response('Forbidden', { status: 403 })
		}
		return undefined
	}

	private renderSwaggerUiHtml(): string {
		const title = this.escapeHtml(this.uiTitle)
		const openApiRoute = this.escapeJsString(this.openApiRoute)

		return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${title}</title>
	<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
	<div id="swagger-ui"></div>
	<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
	<script>
		window.onload = function () {
			window.ui = SwaggerUIBundle({
				url: '${openApiRoute}',
				dom_id: '#swagger-ui'
			});
		};
	</script>
</body>
</html>`
	}

	private escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
	}

	private escapeJsString(value: string): string {
		return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
	}

	private toErrorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
