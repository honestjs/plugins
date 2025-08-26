# @honestjs/rpc-plugin

A comprehensive RPC plugin for HonestJS that combines route analysis, schema generation, and client generation into a
single solution.

## Features

- **Route Analysis**: Automatically analyzes controller methods and extracts type information using ts-morph
- **Schema Generation**: Generates JSON schemas and TypeScript interfaces from types used in controllers
- **Client Generation**: Creates a fully-typed TypeScript RPC client with proper parameter typing
- **Type Safety**: Full TypeScript support with generated types and interfaces

## Installation

```bash
npm install @honestjs/rpc-plugin
# or
yarn add @honestjs/rpc-plugin
# or
pnpm add @honestjs/rpc-plugin
```

## Usage

### Basic Setup

```typescript
import { RPCPlugin } from '@honestjs/rpc-plugin'
import { Application } from 'honestjs'

const app = new Application({
	plugins: [
		new RPCPlugin({
			outputDir: './generated/rpc'
		})
	]
})
```

### Configuration Options

```typescript
interface RPCPluginOptions {
	readonly controllerPattern?: string // Glob pattern for controller files (default: 'src/modules/*/*.controller.ts')
	readonly tsConfigPath?: string // Path to tsconfig.json (default: 'tsconfig.json')
	readonly outputDir?: string // Output directory for generated files (default: './generated/rpc')
	readonly generateOnInit?: boolean // Generate files on initialization (default: true)
}
```

## What It Generates

### TypeScript RPC Client (`client.ts`)

The plugin generates a single comprehensive file that includes both the client and all type definitions:

- **Controller-based organization**: Methods grouped by controller
- **Type-safe parameters**: Path, query, and body parameters with proper typing
- **Flexible request options**: Clean separation of params, query, body, and headers
- **Error handling**: Built-in error handling with custom ApiError class
- **Authentication support**: Easy header and auth token management
- **Integrated types**: All DTOs, interfaces, and utility types included in the same file

```typescript
// Generated client usage
import { ApiClient } from './generated/rpc/client'

// Create client instance with base URL
const apiClient = new ApiClient('http://localhost:3000')

// Type-safe API calls
const user = await apiClient.users.create({
	body: { name: 'John', email: 'john@example.com' }
})

const users = await apiClient.users.list({
	query: { page: 1, limit: 10 }
})

const user = await apiClient.users.getById({
	params: { id: '123' }
})

// Set default authentication
apiClient.setDefaultAuth('your-jwt-token')

// Set custom headers
apiClient.setDefaultHeaders({
	'X-API-Key': 'your-api-key'
})
```

The generated `client.ts` file contains everything you need:

- **ApiClient class** with all your controller methods
- **Type definitions** for requests, responses, and DTOs
- **Utility types** like RequestOptions and ApiResponse
- **Generated interfaces** from your controller types

## How It Works

### 1. Route Analysis

- Scans your HonestJS route registry
- Uses ts-morph to analyze controller source code
- Extracts method signatures, parameter types, and return types
- Builds comprehensive route metadata

### 2. Schema Generation

- Analyzes types used in controller methods
- Generates JSON schemas using ts-json-schema-generator
- Creates TypeScript interfaces from schemas
- Integrates with route analysis for complete type coverage

### 3. Client Generation

- Groups routes by controller for organization
- Generates type-safe method signatures
- Creates parameter validation and typing
- Builds the complete RPC client with proper error handling

## Benefits of the Unified Approach

- **No Duplication**: Single source of truth for all type information
- **Tight Coupling**: Components share data directly without file I/O
- **Better Performance**: Eliminates redundant analysis and file generation
- **Consistent Types**: All generated code uses the same type definitions
- **Easier Maintenance**: Single plugin to configure and maintain

## Example Generated Output

### Route Analysis

```typescript
export interface ExtendedRouteInfo {
	controller: string
	handler: string
	method: string
	path: string
	fullPath: string
	returns?: string
	parameters?: ParameterMetadataWithType[]
}

export const ANALYZED_ROUTES = [
	{
		controller: 'UsersController',
		handler: 'create',
		method: 'POST',
		path: '/',
		fullPath: '/api/v1/users/',
		returns: 'Promise<User>',
		parameters: [
			{
				index: 0,
				name: 'createUserDto',
				type: 'CreateUserDto',
				required: true,
				data: undefined
			}
		]
	}
] as const
```

### Generated Client

```typescript
export class ApiClient {
	get users() {
		return {
			create: async (
				options: RequestOptions<{ name: string; email: string }, undefined, undefined, undefined>
			): Promise<ApiResponse<any>> => {
				return this.request('POST', `/api/v1/users/`, options)
			},
			list: async (
				options?: RequestOptions<undefined, { page: number; limit: number }, undefined, undefined>
			): Promise<ApiResponse<any>> => {
				return this.request('GET', `/api/v1/users/`, options)
			}
		}
	}
}

// RequestOptions type definition
export type RequestOptions<
	TParams = undefined,
	TQuery = undefined,
	TBody = undefined,
	THeaders = undefined
> = (TParams extends undefined ? object : { params: TParams }) &
	(TQuery extends undefined ? object : { query: TQuery }) &
	(TBody extends undefined ? object : { body: TBody }) &
	(THeaders extends undefined ? object : { headers: THeaders })
```

## Plugin Lifecycle

The plugin automatically generates files when your HonestJS application starts up (if `generateOnInit` is true). You can
also manually trigger generation:

```typescript
const rpcPlugin = new RPCPlugin()
await rpcPlugin.analyze() // Manually trigger analysis and generation
```

## Dependencies

- **ts-morph**: TypeScript source code analysis
- **ts-json-schema-generator**: JSON schema generation from TypeScript types
- **honestjs**: Core framework integration

## License

MIT
