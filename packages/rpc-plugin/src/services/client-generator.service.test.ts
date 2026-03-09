import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { ClientGeneratorService } from './client-generator.service'
import type { ExtendedRouteInfo } from '../types/route.types'
import type { SchemaInfo } from '../types/schema.types'

const mockRoute: ExtendedRouteInfo = {
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

const mockSchema: SchemaInfo = {
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

describe('ClientGeneratorService', () => {
	let outputDir: string

	afterEach(() => {
		if (outputDir && fs.existsSync(outputDir)) {
			fs.rmSync(outputDir, { recursive: true })
		}
	})

	it('returns correct shape with clientFile and generatedAt', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new ClientGeneratorService(outputDir)

		const result = await service.generateClient([mockRoute], [mockSchema])

		expect(result).toHaveProperty('clientFile')
		expect(result.clientFile).toMatch(/client\.ts$/)
		expect(result).toHaveProperty('generatedAt')
		expect(result.generatedAt).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
		)
	})

	it('writes client file to outputDir', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new ClientGeneratorService(outputDir)

		const result = await service.generateClient([mockRoute], [mockSchema])

		expect(fs.existsSync(result.clientFile)).toBe(true)
		expect(result.clientFile).toBe(path.join(outputDir, 'client.ts'))
	})

	it('generated content includes ApiError and RequestOptions', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new ClientGeneratorService(outputDir)

		await service.generateClient([mockRoute], [mockSchema])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('export class ApiError')
		expect(content).toContain('RequestOptions')
	})

	it('generated content includes route path and handler', async () => {
		outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-client-'))
		const service = new ClientGeneratorService(outputDir)

		await service.generateClient([mockRoute], [mockSchema])

		const content = fs.readFileSync(path.join(outputDir, 'client.ts'), 'utf-8')
		expect(content).toContain('/api/v1/users/:id')
		expect(content).toContain('getById')
	})
})
