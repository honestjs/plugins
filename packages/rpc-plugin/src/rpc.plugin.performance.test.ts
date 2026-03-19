import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { RPCPlugin } from './rpc.plugin'

/**
 * Performance benchmark tests for RPC plugin analyzeEverything.
 * These tests verify that latency doesn't regress and ensure reasonable throughput.
 *
 * Thresholds (in milliseconds):
 * - Small (10 controllers): < 1500ms
 * - Medium (50 controllers): < 5000ms
 * - Large (100+ controllers): < 15000ms
 */
describe('RPC Plugin Performance', () => {
	let tempDir: string

	beforeAll(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-perf-'))
	})

	afterAll(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true })
		}
	})

	/**
	 * Generate fixture controller code with a specified number of methods.
	 */
	function generateControllerFixture(count: number): { code: string; methodCount: number } {
		const methods = Array.from({ length: count }, (_, i) => {
			const num = i + 1
			return `
    @Get('/item-${num}')
    async getItem${num}(): Promise<Item${num}Dto> {
      return { id: ${num}, name: 'Item ${num}', value: ${num * 100} }
    }
  `
		}).join('\n')

		const dtosImports = Array.from({ length: count }, (_, i) => {
			return `
interface Item${i + 1}Dto {
  id: number
  name: string
  value: number
}
  `
		}).join('\n')

		const code = `
import { Controller, Get } from '@honestjs/honest'

${dtosImports}

@Controller('/items')
export class ItemsController {
${methods}
}
  `

		return { code, methodCount: count }
	}

	/**
	 * Create a temporary project with fixture controllers and tsconfig.
	 */
	async function createFixtureProject(controllerCount: number): Promise<string> {
		const fixtureDir = path.join(tempDir, `fixture-${controllerCount}`)
		fs.mkdirSync(fixtureDir, { recursive: true })

		// Create source directory
		const srcDir = path.join(fixtureDir, 'src')
		fs.mkdirSync(srcDir, { recursive: true })

		// Write controllers
		const { code } = generateControllerFixture(controllerCount)
		fs.writeFileSync(path.join(srcDir, 'items.controller.ts'), code)

		// Write tsconfig
		const tsconfig = {
			compilerOptions: {
				target: 'ES2020',
				module: 'ESNext',
				lib: ['ES2020'],
				outDir: './dist',
				rootDir: './src',
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				forceConsistentCasingInFileNames: true
			},
			include: ['src/**/*'],
			exclude: ['node_modules', 'dist']
		}

		fs.writeFileSync(path.join(fixtureDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

		return fixtureDir
	}

	/**
	 * Measure analyzeEverything latency for a fixture.
	 */
	async function measureAnalyzeDuration(fixtureDir: string): Promise<number> {
		const plugin = new RPCPlugin({
			tsConfigPath: path.join(fixtureDir, 'tsconfig.json'),
			controllerPattern: path.join(fixtureDir, 'src/**/*.controller.ts'),
			outputDir: path.join(fixtureDir, 'generated')
		})

		const startTime = performance.now()
		await plugin.analyze({ force: true, dryRun: true })
		const duration = performance.now() - startTime

		plugin.dispose()
		return duration
	}

	it('analyzes small fixture (10 controllers) within 1500ms', async () => {
		const fixtureDir = await createFixtureProject(10)
		const duration = await measureAnalyzeDuration(fixtureDir)

		console.log(`[perf] Small fixture (10 controllers): ${duration.toFixed(2)}ms`)
		expect(duration).toBeLessThan(1500)
	})

	it('analyzes medium fixture (50 controllers) within 5000ms', { timeout: 15000 }, async () => {
		const fixtureDir = await createFixtureProject(50)
		const duration = await measureAnalyzeDuration(fixtureDir)

		console.log(`[perf] Medium fixture (50 controllers): ${duration.toFixed(2)}ms`)
		expect(duration).toBeLessThan(5000)
	})

	it('analyzes large fixture (100+ controllers) within 15000ms', { timeout: 30000 }, async () => {
		const fixtureDir = await createFixtureProject(100)
		const duration = await measureAnalyzeDuration(fixtureDir)

		console.log(`[perf] Large fixture (100+ controllers): ${duration.toFixed(2)}ms`)
		expect(duration).toBeLessThan(15000)
	})

	/**
	 * Baseline regression test: successive runs should cache and be faster.
	 */
	it('cache hit is significantly faster than initial analysis', { timeout: 30000 }, async () => {
		const fixtureDir = await createFixtureProject(30)

		// First run (force=true, cold)
		const plugin1 = new RPCPlugin({
			tsConfigPath: path.join(fixtureDir, 'tsconfig.json'),
			controllerPattern: path.join(fixtureDir, 'src/**/*.controller.ts'),
			outputDir: path.join(fixtureDir, 'generated')
		})

		const startCold = performance.now()
		await plugin1.analyze({ force: true, dryRun: false })
		const coldDuration = performance.now() - startCold
		plugin1.dispose()

		// Second run (force=false, warm with cache)
		const plugin2 = new RPCPlugin({
			tsConfigPath: path.join(fixtureDir, 'tsconfig.json'),
			controllerPattern: path.join(fixtureDir, 'src/**/*.controller.ts'),
			outputDir: path.join(fixtureDir, 'generated')
		})

		const startWarm = performance.now()
		await plugin2.analyze({ force: false, dryRun: true })
		const warmDuration = performance.now() - startWarm
		plugin2.dispose()

		console.log(`[perf] Cold run (30 controllers): ${coldDuration.toFixed(2)}ms`)
		console.log(`[perf] Warm run (cache hit): ${warmDuration.toFixed(2)}ms`)
		console.log(`[perf] Speedup: ${(coldDuration / warmDuration).toFixed(1)}x`)

		// Cache hit should be at least 2x faster
		expect(warmDuration).toBeLessThan(coldDuration / 2)
	})

	/**
	 * Latency stability: multiple runs should have consistent timing (no major variance).
	 */
	it('latency is stable across multiple runs', { timeout: 30000 }, async () => {
		const fixtureDir = await createFixtureProject(20)
		const iterations = 3
		const durations: number[] = []

		for (let i = 0; i < iterations; i++) {
			const plugin = new RPCPlugin({
				tsConfigPath: path.join(fixtureDir, 'tsconfig.json'),
				controllerPattern: path.join(fixtureDir, 'src/**/*.controller.ts'),
				outputDir: path.join(fixtureDir, 'generated')
			})

			const start = performance.now()
			await plugin.analyze({ force: false, dryRun: true })
			const duration = performance.now() - start

			durations.push(duration)
			plugin.dispose()
		}

		const avg = durations.reduce((a, b) => a + b) / durations.length
		const variance = durations.reduce((sum, d) => sum + Math.abs(d - avg), 0) / durations.length
		const coefficientOfVariation = variance / avg

		console.log(`[perf] Run 1: ${durations[0]?.toFixed(2)}ms`)
		console.log(`[perf] Run 2: ${durations[1]?.toFixed(2)}ms`)
		console.log(`[perf] Run 3: ${durations[2]?.toFixed(2)}ms`)
		console.log(
			`[perf] Average: ${avg.toFixed(2)}ms, Variance: ${variance.toFixed(2)}ms (CV: ${(coefficientOfVariation * 100).toFixed(1)}%)`
		)

		// Coefficient of variation should be < 30% (reasonable stability)
		expect(coefficientOfVariation).toBeLessThan(0.3)
	})
})
