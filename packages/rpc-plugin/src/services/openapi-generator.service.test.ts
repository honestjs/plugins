import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ResolvedOpenApiOptions } from './openapi-generator.service'
import { OpenApiGeneratorService } from './openapi-generator.service'
import type { ExtendedRouteInfo } from '../types/route.types'
import type { SchemaInfo } from '../types/schema.types'

describe('OpenApiGeneratorService', () => {
	let outputDir: string

	afterEach(() => {
		if (outputDir && fs.existsSync(outputDir)) {
			fs.rmSync(outputDir, { recursive: true })
		}
	})

	it('writes spec file and returns its path', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-openapi-'))
		const service = new OpenApiGeneratorService(outputDir)
		const routes: ExtendedRouteInfo[] = [
			{
				method: 'GET',
				path: '/:id',
				prefix: '/api',
				version: 'v1',
				route: 'users',
				fullPath: '/api/v1/users/:id',
				handler: 'getById',
				controller: 'UsersController',
				parameters: [
					{
						index: 0,
						name: 'id',
						decoratorType: 'param',
						type: 'string',
						required: true,
						data: 'id',
						factory: () => null
					}
				],
				returns: 'User'
			}
		]
		const schemas: SchemaInfo[] = [
			{
				type: 'User',
				schema: {
					definitions: {
						User: {
							type: 'object',
							properties: {
								id: { type: 'string' },
								name: { type: 'string' }
							}
						}
					}
				}
			}
		]
		const options: ResolvedOpenApiOptions = {
			title: 'Test API',
			version: '1.0.0',
			description: 'Test',
			servers: [],
			outputFile: 'openapi.json'
		}

		const outPath = await service.generateSpec(routes, schemas, options)

		expect(outPath).toBe(path.join(outputDir, 'openapi.json'))
		expect(fs.existsSync(outPath)).toBe(true)
	})

	it('generates valid OpenAPI 3.0.3 spec with paths and components', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-openapi-'))
		const service = new OpenApiGeneratorService(outputDir)
		const routes: ExtendedRouteInfo[] = [
			{
				method: 'GET',
				path: '/:id',
				prefix: '/api',
				version: 'v1',
				route: 'users',
				fullPath: '/api/v1/users/:id',
				handler: 'getById',
				controller: 'UsersController',
				parameters: [
					{
						index: 0,
						name: 'id',
						decoratorType: 'param',
						type: 'string',
						required: true,
						data: 'id',
						factory: () => null
					}
				],
				returns: 'User'
			}
		]
		const schemas: SchemaInfo[] = [
			{
				type: 'User',
				schema: {
					definitions: {
						User: {
							type: 'object',
							properties: { id: { type: 'string' } }
						}
					}
				}
			}
		]
		const options: ResolvedOpenApiOptions = {
			title: 'My API',
			version: '2.0.0',
			description: 'Desc',
			servers: [{ url: 'https://api.example.com' }],
			outputFile: 'spec.json'
		}

		await service.generateSpec(routes, schemas, options)

		const raw = fs.readFileSync(path.join(outputDir, 'spec.json'), 'utf-8')
		const spec = JSON.parse(raw)

		expect(spec.openapi).toBe('3.0.3')
		expect(spec.info.title).toBe('My API')
		expect(spec.info.version).toBe('2.0.0')
		expect(spec.servers).toEqual([{ url: 'https://api.example.com' }])

		const pathKey = '/api/v1/users/{id}'
		expect(spec.paths[pathKey]).toBeDefined()
		expect(spec.paths[pathKey].get).toBeDefined()
		expect(spec.paths[pathKey].get.operationId).toBe('getById')
		expect(spec.paths[pathKey].get.tags).toEqual(['Users'])
		expect(spec.paths[pathKey].get.parameters).toEqual([
			{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }
		])
		expect(spec.paths[pathKey].get.responses['200']).toBeDefined()
		expect(spec.paths[pathKey].get.responses['200'].content['application/json'].schema).toEqual({
			$ref: '#/components/schemas/User'
		})

		expect(spec.components.schemas.User).toBeDefined()
		expect(spec.components.schemas.User.type).toBe('object')
		expect(spec.components.schemas.User.properties.id).toEqual({ type: 'string' })
	})
})
