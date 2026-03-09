import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { RPCPlugin } from './rpc.plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const validTsConfigPath = path.join(__dirname, '..', 'tsconfig.json')

describe('RPCPlugin', () => {
	describe('constructor', () => {
		it('throws when controllerPattern is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: '',
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).toThrow(/Configuration validation failed.*Controller pattern cannot be empty/)
		})

		it('throws when tsConfigPath is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: '',
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).toThrow(/Configuration validation failed.*TypeScript config path cannot be empty/)
		})

		it('throws when tsconfig file does not exist', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: '/nonexistent/tsconfig.json',
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).toThrow(/TypeScript config file not found/)
		})

		it('throws when outputDir is empty', () => {
			expect(
				() =>
					new RPCPlugin({
						controllerPattern: 'src/**/*.controller.ts',
						tsConfigPath: validTsConfigPath,
						outputDir: ''
					})
			).toThrow(/Configuration validation failed.*Output directory cannot be empty/)
		})

		it('does not throw with valid default options', () => {
			expect(
				() =>
					new RPCPlugin({
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated')
					})
			).not.toThrow()
		})

		it('does not throw with openapi: true', () => {
			expect(
				() =>
					new RPCPlugin({
						tsConfigPath: validTsConfigPath,
						outputDir: path.join(__dirname, '..', 'generated'),
						openapi: true
					})
			).not.toThrow()
		})
	})
})
