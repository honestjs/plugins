import fs from 'fs'
import os from 'os'
import path from 'path'
import { Project } from 'ts-morph'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SchemaGeneratorService } from './schema-generator.service'

let tempDir: string

afterEach(() => {
	if (tempDir && fs.existsSync(tempDir)) {
		fs.rmSync(tempDir, { recursive: true, force: true })
	}
})

function createTempProject(files: Record<string, string>): {
	project: Project
	controllerPattern: string
	tsConfigPath: string
} {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-gen-test-'))
	const tsConfigPath = path.join(tempDir, 'tsconfig.json')
	fs.writeFileSync(
		tsConfigPath,
		JSON.stringify({
			compilerOptions: {
				target: 'ES2020',
				module: 'ESNext',
				moduleResolution: 'bundler',
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				declaration: true,
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			},
			include: ['src/**/*.ts']
		})
	)

	const srcDir = path.join(tempDir, 'src', 'modules', 'test')
	fs.mkdirSync(srcDir, { recursive: true })

	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(srcDir, name), content)
	}

	const controllerPattern = path.join(srcDir, '*.controller.ts')
	const project = new Project({ tsConfigFilePath: tsConfigPath })
	project.addSourceFilesAtPaths([controllerPattern])

	return { project, controllerPattern, tsConfigPath }
}

describe('SchemaGeneratorService', () => {
	describe('generateSchemas', () => {
		it('returns empty array when no source files match pattern', async () => {
			tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-gen-test-'))
			const tsConfigPath = path.join(tempDir, 'tsconfig.json')
			fs.writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: {} }))

			const service = new SchemaGeneratorService('nonexistent/**/*.ts', tsConfigPath)
			const project = new Project({ useInMemoryFileSystem: true })

			const result = await service.generateSchemas(project)
			expect(result).toEqual([])
		})

		it('collects types from controller methods and generates schemas', async () => {
			const { project, controllerPattern, tsConfigPath } = createTempProject({
				'test.controller.ts': `
					interface UserDto {
						id: string
						name: string
					}

					class TestController {
						findAll(): UserDto[] {
							return []
						}
					}
				`
			})

			const service = new SchemaGeneratorService(controllerPattern, tsConfigPath)
			const result = await service.generateSchemas(project)

			expect(result.length).toBeGreaterThanOrEqual(1)
			const userSchema = result.find((s) => s.type === 'UserDto')
			expect(userSchema).toBeDefined()
			expect(userSchema!.schema).toBeDefined()
			expect(userSchema!.typescriptType).toBeDefined()
		})

		it('collects parameter types from methods', async () => {
			const { project, controllerPattern, tsConfigPath } = createTempProject({
				'test.controller.ts': `
					interface CreateItemDto {
						title: string
					}

					class ItemsController {
						create(dto: CreateItemDto): string {
							return 'ok'
						}
					}
				`
			})

			const service = new SchemaGeneratorService(controllerPattern, tsConfigPath)
			const result = await service.generateSchemas(project)

			const dtoSchema = result.find((s) => s.type === 'CreateItemDto')
			expect(dtoSchema).toBeDefined()
		})

		it('resets warnings on each call', async () => {
			const service = new SchemaGeneratorService('nonexistent/**/*.ts', '/fake/tsconfig.json')
			const project = new Project({ useInMemoryFileSystem: true })

			await service.generateSchemas(project)
			const warnings1 = service.getWarnings()

			await service.generateSchemas(project)
			const warnings2 = service.getWarnings()

			expect(warnings2).toEqual([])
			expect(warnings1).toEqual(warnings2)
		})
	})

	describe('error handling', () => {
		it('adds warning when schema generation fails with failOnSchemaError=false', async () => {
			const { project, controllerPattern, tsConfigPath } = createTempProject({
				'test.controller.ts': `
					import type { NonExistentExternalType } from 'non-existent-package'

					class TestController {
						handler(): NonExistentExternalType {
							return {} as any
						}
					}
				`
			})

			const service = new SchemaGeneratorService(controllerPattern, tsConfigPath, {
				failOnSchemaError: false
			})

			const result = await service.generateSchemas(project)
			expect(service.getWarnings().length).toBeGreaterThan(0)
			expect(service.getWarnings().some((w) => w.includes('Failed to generate schema'))).toBe(true)
		})

		it('throws when schema generation fails with failOnSchemaError=true', async () => {
			const { project, controllerPattern, tsConfigPath } = createTempProject({
				'test.controller.ts': `
					import type { NonExistentExternalType } from 'non-existent-package'

					class TestController {
						handler(): NonExistentExternalType {
							return {} as any
						}
					}
				`
			})

			const service = new SchemaGeneratorService(controllerPattern, tsConfigPath, {
				failOnSchemaError: true
			})

			await expect(service.generateSchemas(project)).rejects.toThrow()
		})

		it('calls onWarn callback when schema generation fails', async () => {
			const onWarn = vi.fn()
			const { project, controllerPattern, tsConfigPath } = createTempProject({
				'test.controller.ts': `
					import type { NonExistentExternalType } from 'non-existent-package'

					class TestController {
						handler(): NonExistentExternalType {
							return {} as any
						}
					}
				`
			})

			const service = new SchemaGeneratorService(controllerPattern, tsConfigPath, {
				failOnSchemaError: false,
				onWarn
			})

			await service.generateSchemas(project)
			expect(onWarn).toHaveBeenCalled()
			expect(onWarn.mock.calls[0][0]).toContain('Failed to generate schema')
		})

		it('generates interfaces and types for all definitions', async () => {
			const { project, controllerPattern, tsConfigPath } = createTempProject({
				'test.controller.ts': `
					export type UserRole = 'user' | 'admin'

					export interface Post {
						id: string
						title: string
					}

					export interface UserDto {
						id: string
						role: UserRole
						posts: Post[]
					}

					class TestController {
						findAll(): UserDto[] {
							return []
						}
					}
				`
			})

			const service = new SchemaGeneratorService(controllerPattern, tsConfigPath)
			const result = await service.generateSchemas(project)

			expect(result.length).toBeGreaterThanOrEqual(1)
			const userSchema = result.find((s) => s.type === 'UserDto')
			expect(userSchema).toBeDefined()
			expect(userSchema!.typescriptType).toMatch(
				"export interface UserDto {\n\tid: string\n\trole: UserRole\n\tposts: Post[]\n}\n\nexport type UserRole = 'user' | 'admin'\n\nexport interface Post {\n\tid: string\n\ttitle: string\n}"
			)
		})
	})
})
