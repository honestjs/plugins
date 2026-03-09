import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		glob: ['src/**/*.test.ts'],
		environment: 'node'
	}
})
