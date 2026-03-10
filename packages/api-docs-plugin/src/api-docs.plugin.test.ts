import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { Application, Controller, Get, Module, RouteRegistry } from 'honestjs'
import 'reflect-metadata'
import { ApiDocsPlugin } from './api-docs.plugin'

function createTempDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

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

@Controller('/health')
class TestController {
	@Get()
	index() {
		return { ok: true }
	}
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('ApiDocsPlugin', () => {
	const originalCwd = process.cwd()
	const tempDirs: string[] = []

	afterEach(() => {
		RouteRegistry.clear()
		process.chdir(originalCwd)
		for (const dir of tempDirs) {
			if (fs.existsSync(dir)) {
				fs.rmSync(dir, { recursive: true })
			}
		}
		tempDirs.length = 0
	})

	it('serves OpenAPI JSON from direct artifact', async () => {
		const plugin = new ApiDocsPlugin({
			artifact: minimalArtifact,
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
})
