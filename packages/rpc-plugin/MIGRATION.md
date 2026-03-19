# RPC Plugin Migration Guide for Generator Authors

## Overview

This guide helps third-party generator authors ensure compatibility with the RPC plugin system, particularly around
versioning and capability negotiation introduced in version 1.

## Generator Compatibility Model

The RPC plugin uses **API versioning** and **capability declarations** to ensure generators can safely declare which
features they require or support.

### Understanding Versions and Capabilities

#### API Versions

`supportedApiVersions` declares which versions of the plugin API your generator supports.

```typescript
import type { RPCGenerator } from '@honestjs/rpc-plugin'

const myGenerator: RPCGenerator = {
	name: 'my-generator',
	supportedApiVersions: ['1'], // Supports plugin API v1
	generate: async (context) => {
		// ... implementation
	}
}
```

**When to declare versions:**

- Your generator depends on the structure of `context.routes`, `context.schemas`, or other context fields
- You want to be explicit about forward/backward compatibility
- You're planning to support multiple plugin versions

**Default behavior:** If `supportedApiVersions` is omitted, the plugin assumes your generator supports the current
plugin API version.

#### Capability Requirements

`requiredCapabilities` declares which plugin features your generator needs.

```typescript
const advancedGenerator: RPCGenerator = {
	name: 'advanced-generator',
	requiredCapabilities: ['routes', 'schemas', 'client-interceptors'],
	generate: async (context) => {
		const { routes, schemas, pluginCapabilities } = context

		// Use generated client interceptors if available
		if (pluginCapabilities.includes('client-interceptors')) {
			// ... generate code that uses interceptors
		}
	}
}
```

**Available capabilities** (as of plugin API v1):

- `'routes'` — Route analysis data available
- `'schemas'` — JSON schema generation for types
- `'analysis-hooks'` — Pre-analysis filters and post-analysis transforms
- `'atomic-persistence'` — Atomic write guarantees for generated artifacts
- `'client-interceptors'` — Request/response interceptor support in generated clients

**When to declare requirements:**

- Your generator generates code that depends on specific plugin features
- You want to fail fast if the plugin lacks a feature rather than silently degrading
- You're building features on top of optional plugin capabilities

**Default behavior:** If `requiredCapabilities` is omitted, no capabilities are required.

## Practical Examples

### Example 1: Basic Generator (No Versioning)

If your generator is simple and doesn't depend on new plugin features, you don't need to declare anything:

```typescript
import type { RPCGenerator, RPCGeneratorContext } from '@honestjs/rpc-plugin'

export const basicGenerator: RPCGenerator = {
	name: 'basic-generator',
	async generate(context: RPCGeneratorContext) {
		const { routes, schemas, outputDir } = context

		// Generate code...

		return {
			generator: 'basic-generator',
			generatedAt: new Date().toISOString(),
			outputFiles: ['./client.ts']
		}
	}
}
```

### Example 2: Generator with Version Compatibility

If you're building a generator that might see future plugin versions, be explicit:

```typescript
export const versionedGenerator: RPCGenerator = {
	name: 'versioned-generator',
	supportedApiVersions: ['1', '2'], // Ready for v2 when it ships
	async generate(context: RPCGeneratorContext) {
		const { pluginApiVersion } = context

		if (pluginApiVersion === '1') {
			// v1-specific code generation
		} else if (pluginApiVersion === '2') {
			// v2-specific code generation
		}

		return {
			generator: 'versioned-generator',
			generatedAt: new Date().toISOString(),
			outputFiles: []
		}
	}
}
```

### Example 3: Generator with Capability Requirements

If your generator generates client code that uses interceptors:

```typescript
export const interceptorGenerator: RPCGenerator = {
	name: 'interceptor-generator',
	requiredCapabilities: ['routes', 'schemas', 'client-interceptors'],
	async generate(context: RPCGeneratorContext) {
		const { routes, schemas, pluginCapabilities } = context

		// Fail fast if interceptors aren't supported
		if (!pluginCapabilities.includes('client-interceptors')) {
			throw new Error('This generator requires client-interceptor support')
		}

		// Generate code using interceptors...

		return {
			generator: 'interceptor-generator',
			generatedAt: new Date().toISOString(),
			outputFiles: []
		}
	}
}
```

## Version Negotiation: What Happens Under the Hood

When you register a generator with the plugin, it validates compatibility during plugin construction:

```javascript
const plugin = new RPCPlugin({
	generators: [myGenerator] // Validation happens here
})
```

**Validation checks:**

1. **API Version Match**
    - If `supportedApiVersions` is defined:
        - Plugin checks if current plugin version is in the list
        - If no match → throws error with message: `"Generator 'X' does not support RPC plugin API version Y"`
    - If `supportedApiVersions` is undefined:
        - Assumes support for current plugin API version

2. **Capability Availability**
    - If `requiredCapabilities` is defined:
        - Plugin checks if each required capability is in `pluginCapabilities`
        - If any missing → throws error with message: `"Generator 'X' requires unsupported capability 'Y'"`

**Error Example:**

```
Error: Generator "legacy-generator" does not support RPC plugin API version 1
```

**How to fix:** Update your generator's `supportedApiVersions`:

```typescript
// Before (broken)
supportedApiVersions: ['0']

// After (fixed)
supportedApiVersions: ['1'] // or ['0', '1'] for backward compat
```

## Migration Path: Updating an Existing Generator

If you have an existing generator and need to update it for new plugin versions:

### Step 1: Test Compatibility

Add your generator to a test suite:

```typescript
import { describe, it, expect } from 'vitest'
import { RPCPlugin } from '@honestjs/rpc-plugin'
import { myGenerator } from './my-generator'

describe('myGenerator compatibility', () => {
	it('initializes with the current RPC plugin', () => {
		expect(() => {
			new RPCPlugin({
				generators: [myGenerator]
			})
		}).not.toThrow()
	})
})
```

### Step 2: Declare Version Support

Update your generator's interface:

```typescript
const myGenerator: RPCGenerator = {
	name: 'my-generator',
	supportedApiVersions: ['1'], // Add this
	generate: async (context) => {
		// ... existing implementation
	}
}
```

### Step 3: Validate Context Shape

If the plugin context changes in future versions, use `pluginApiVersion` to branch:

```typescript
generate: async (context) => {
	if (context.pluginApiVersion === '1') {
		// v1 context shape
		return handleV1(context)
	}
	// Fallback or throw for unknown versions
	throw new Error(`Unsupported plugin API version: ${context.pluginApiVersion}`)
}
```

## Best Practices

1. **Be explicit about versions** — Even if you only support v1, declare it. This helps users understand your
   generator's maturity.

2. **Don't overuse capabilities** — Only declare capabilities you actually use. This prevents unnecessary friction if a
   user has an older plugin.

3. **Fail fast on incompatibility** — If a required capability is missing, throw an error with a clear message rather
   than silently degrading.

4. **Document your generator's requirements** — Include a README section explaining which plugin features your generator
   uses.

5. **Test against multiple contexts** — If you support multiple plugin versions, test the context shape for each
   version.

## Common Patterns

### Pattern 1: Opt-in to New Features

```typescript
generate: async (context) => {
	let hasInterceptors = false

	if (context.pluginCapabilities?.includes('client-interceptors')) {
		hasInterceptors = true
	}

	// Conditionally generate code based on capability availability
	if (hasInterceptors) {
		// ... generate with interceptor support
	} else {
		// ... generate without interceptors
	}
}
```

### Pattern 2: Forward-Compatible Versioning

```typescript
supportedApiVersions: ['1', '2', '3'],  // Optimistic about future versions
```

This works well if your generator's interface doesn't change frequently.

## Troubleshooting

### Error: "Generator does not support RPC plugin API version X"

**Cause:** Your generator's `supportedApiVersions` doesn't include the plugin's current version.

**Fix:** Update `supportedApiVersions` to include the version number. Check `pluginApiVersion` in the context to
determine the current version.

### Error: "requires unsupported capability 'X'"

**Cause:** Your generator declares a `requiredCapabilities` entry that the plugin doesn't have.

**Fix:**

1. Remove the capability from `requiredCapabilities` if you don't actually need it
2. Or, gracefully handle the missing capability (see "Pattern 1" above)

### Generator runs but produces incorrect output

**Cause:** Context shape changed between plugin versions.

**Fix:** Use `pluginApiVersion` to handle different context shapes, or add a test that validates the context structure
matches your expectations.

## Questions?

For plugin development questions, refer to:

- [RPC Plugin README](./README.md)
- [Generator Types](./src/types/generator.types.ts)
- [TypeScript Client Generator Example](./src/generators/typescript-client.generator.ts)
