import { describe, expect, it } from 'vitest'
import { Application, Module } from 'honestjs'
import 'reflect-metadata'
import { ApiDocsPlugin } from './api-docs.plugin'

const minimalArtifact = {
	routes: [
		{
			method: 'GET',
			handler: 'index',
			controller: 'TestController',
			fullPath: '/health',
			parameters: [] as const
		}
	],
	schemas: [] as const
}

const versionedArtifact = {
	artifactVersion: '1',
	...minimalArtifact
}

// @ts-expect-error HonestJS currently uses legacy decorator semantics in runtime metadata.
@Module({})
class TestModule {}

describe('ApiDocsPlugin', () => {

	it('serves OpenAPI JSON from direct artifact', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: versionedArtifact,
			title: 'Inline API',
			version: '1.0.0'
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(200)
		expect(json.openapi).toBe('3.0.3')
		expect(json.info.title).toBe('Inline API')
		expect(json.paths['/health']).toBeDefined()
	})

	it('serves OpenAPI JSON from context key (rpc.artifact)', async () => {
		const plugin = new ApiDocsPlugin({ artifact: 'rpc.artifact' })
		const { hono } = await Application.create(TestModule, {
			plugins: [
				{
					plugin: plugin,
					preProcessors: [
						async (_app, _hono, ctx) => {
							ctx.set('rpc.artifact', minimalArtifact)
						}
					]
				}
			]
		})
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(200)
		expect(json.openapi).toBe('3.0.3')
		expect(json.paths['/health']).toBeDefined()
		expect(json.paths['/health'].get).toBeDefined()
	})

	it('defaults to rpc.artifact when artifact option omitted', async () => {
		const plugin = new ApiDocsPlugin()
		const { hono } = await Application.create(TestModule, {
			plugins: [
				{
					plugin: plugin,
					preProcessors: [
						async (_app, _hono, ctx) => {
							ctx.set('rpc.artifact', minimalArtifact)
						}
					]
				}
			]
		})
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(200)
		expect(json.openapi).toBe('3.0.3')
		expect(json.paths['/health']).toBeDefined()
	})

	it('serves Swagger UI HTML', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			openApiRoute: '/schema.json',
			uiRoute: '/docs',
			uiTitle: 'My Docs'
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })
		const res = await hono.request('/docs')
		const html = await res.text()

		expect(res.status).toBe(200)
		expect(html).toContain('SwaggerUIBundle')
		expect(html).toContain("url: '/schema.json'")
		expect(html).toContain('<title>My Docs</title>')
	})

	it('returns 500 when artifact missing from context', async () => {
		const plugin = new ApiDocsPlugin({ artifact: 'missing.key' })
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(500)
		expect(json.error).toBe('Failed to load OpenAPI spec')
		expect(json.message).toContain('no artifact at context key')
		expect(json.message).toContain('missing.key')
	})

	it('returns 500 for unsupported artifact version', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: {
				...minimalArtifact,
				artifactVersion: '2'
			}
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(500)
		expect(json.message).toContain('unsupported artifactVersion')
	})

	it('supports auth hooks for OpenAPI and UI routes', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			onOpenApiRequest: async (_c, next) => {
				await next()
			},
			onUiRequest: () => {
				return new Response('blocked', { status: 401 })
			}
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const openApiRes = await hono.request('/openapi.json')
		expect(openApiRes.status).toBe(200)

		const uiRes = await hono.request('/docs')
		expect(uiRes.status).toBe(401)
		expect(await uiRes.text()).toBe('blocked')
	})

	it('returns 403 when auth hook does not call next or return Response', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			onOpenApiRequest: () => {
				// intentionally does nothing
			},
			onUiRequest: () => {
				// intentionally does nothing
			}
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const openApiRes = await hono.request('/openapi.json')
		expect(openApiRes.status).toBe(403)
		expect(await openApiRes.text()).toBe('Forbidden')

		const uiRes = await hono.request('/docs')
		expect(uiRes.status).toBe(403)
		expect(await uiRes.text()).toBe('Forbidden')
	})

	it('caches spec by default (second request uses cached)', async () => {
		let callCount = 0
		const artifact = {
			...minimalArtifact,
			get routes() {
				callCount++
				return minimalArtifact.routes
			}
		}
		const plugin = new ApiDocsPlugin({ artifact })
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const res1 = await hono.request('/openapi.json')
		expect(res1.status).toBe(200)
		const firstCallCount = callCount

		const res2 = await hono.request('/openapi.json')
		expect(res2.status).toBe(200)
		expect(callCount).toBe(firstCallCount)
	})

	it('regenerates spec on each request when reloadOnRequest is true', async () => {
		let callCount = 0
		const originalRoutes = minimalArtifact.routes
		const artifact = {
			schemas: [] as const,
			get routes() {
				callCount++
				return originalRoutes
			}
		}
		const plugin = new ApiDocsPlugin({ artifact, reloadOnRequest: true })
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		await hono.request('/openapi.json')
		const afterFirst = callCount
		await hono.request('/openapi.json')
		expect(callCount).toBeGreaterThan(afterFirst)
	})

	it('returns 500 when context value is not a valid artifact shape', async () => {
		const plugin = new ApiDocsPlugin({ artifact: 'bad.key' })
		const { hono } = await Application.create(TestModule, {
			plugins: [
				{
					plugin: plugin,
					preProcessors: [
						async (_app, _hono, ctx) => {
							ctx.set('bad.key', { notRoutes: true })
						}
					]
				}
			]
		})
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(500)
		expect(json.message).toContain('not a valid artifact')
	})

	it('passes description and servers through to generated spec', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			description: 'My test API description',
			servers: [{ url: 'https://api.example.com', description: 'Prod' }]
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(200)
		expect(json.info.description).toBe('My test API description')
		expect(json.servers).toHaveLength(1)
		expect(json.servers[0].url).toBe('https://api.example.com')
	})

	it('serves spec with schemas populated', async () => {
		const artifactWithSchemas = {
			routes: [
				{
					method: 'GET',
					handler: 'getUser',
					controller: 'UsersController',
					fullPath: '/users/:id',
					returns: 'User',
					parameters: [
						{ name: 'id', data: 'id', type: 'string', decoratorType: 'param', required: true }
					]
				}
			],
			schemas: [
				{
					type: 'User',
					schema: {
						definitions: {
							User: {
								type: 'object',
								properties: { id: { type: 'string' }, name: { type: 'string' } }
							}
						}
					}
				}
			]
		}
		const plugin = new ApiDocsPlugin({ artifact: artifactWithSchemas })
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })
		const res = await hono.request('/openapi.json')
		const json = await res.json()

		expect(res.status).toBe(200)
		expect(json.components.schemas.User).toBeDefined()
		expect(json.paths['/users/{id}'].get.parameters).toHaveLength(1)
		expect(json.paths['/users/{id}'].get.parameters[0].in).toBe('path')
		expect(json.paths['/users/{id}'].get.responses['200'].content['application/json'].schema).toEqual({
			$ref: '#/components/schemas/User'
		})
	})

	it('serves on custom openApiRoute path', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			openApiRoute: '/api/spec'
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const res = await hono.request('/api/spec')
		expect(res.status).toBe(200)
		const json = await res.json()
		expect(json.openapi).toBe('3.0.3')
	})

	it('serves Swagger UI on custom uiRoute path', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			uiRoute: '/swagger'
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const res = await hono.request('/swagger')
		expect(res.status).toBe(200)
		const html = await res.text()
		expect(html).toContain('SwaggerUIBundle')
	})

	it('normalizes routes with trailing slashes', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			openApiRoute: '/spec/',
			uiRoute: '/ui/'
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const specRes = await hono.request('/spec')
		expect(specRes.status).toBe(200)

		const uiRes = await hono.request('/ui')
		expect(uiRes.status).toBe(200)
	})

	it('normalizes routes without leading slash', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
			openApiRoute: 'spec.json',
			uiRoute: 'docs'
		})
		const { hono } = await Application.create(TestModule, { plugins: [plugin] })

		const specRes = await hono.request('/spec.json')
		expect(specRes.status).toBe(200)

		const docsRes = await hono.request('/docs')
		expect(docsRes.status).toBe(200)
	})
})
