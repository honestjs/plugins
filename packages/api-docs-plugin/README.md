# API Docs Plugin

Serves OpenAPI JSON and Swagger UI for your HonestJS application. Always generates the spec from an artifact—pass `{ routes, schemas }` directly or a context key (default `'rpc.artifact'` when using with `@honestjs/rpc-plugin`).

## Installation

```bash
npm install @honestjs/api-docs-plugin
# or
yarn add @honestjs/api-docs-plugin
# or
pnpm add @honestjs/api-docs-plugin
```

## Usage with RPC Plugin

The RPC plugin writes its artifact to the application context. ApiDocs defaults to the context key `'rpc.artifact'`, so you can omit `artifact` when using both plugins. Ensure RPC runs before ApiDocs in the plugins array:

```typescript
import { Application } from "honestjs"
import { RPCPlugin } from "@honestjs/rpc-plugin"
import { ApiDocsPlugin } from "@honestjs/api-docs-plugin"
import AppModule from "./app.module"

const { hono } = await Application.create(AppModule, {
  plugins: [new RPCPlugin(), new ApiDocsPlugin()],
})

export default hono
```

If RPC uses custom `context.namespace` / `context.keys.artifact`, pass the resulting full key to `artifact` (e.g. `new ApiDocsPlugin({ artifact: "custom.artifact" })`).

By default:

- OpenAPI JSON: `/openapi.json`
- Swagger UI: `/docs`

## Manual Artifact

Pass the artifact object directly:

```typescript
import { ApiDocsPlugin } from "@honestjs/api-docs-plugin"

const artifact = {
  routes: [
    {
      method: "GET",
      handler: "list",
      controller: "UsersController",
      fullPath: "/users",
      parameters: [],
    },
  ],
  schemas: [],
}

plugins: [new ApiDocsPlugin({ artifact })]
```

## Configuration Options

```typescript
interface ApiDocsPluginOptions {
  // Optional: artifact - direct object or context key. Default: 'rpc.artifact'
  artifact?: OpenApiArtifactInput | string

  // OpenAPI generation (when converting artifact to spec)
  title?: string
  version?: string
  description?: string
  servers?: readonly { url: string; description?: string }[]

  // Serving
  openApiRoute?: string   // default: '/openapi.json'
  uiRoute?: string        // default: '/docs'
  uiTitle?: string        // default: 'API Docs'
  reloadOnRequest?: boolean  // default: false
}
```

## Programmatic API

For custom workflows, use the exported utilities:

```typescript
import {
  fromArtifactSync,
  write,
  type OpenApiArtifactInput,
  type OpenApiDocument,
} from "@honestjs/api-docs-plugin"

const artifact: OpenApiArtifactInput = { routes: [...], schemas: [...] }
const spec: OpenApiDocument = fromArtifactSync(artifact, {
  title: "My API",
  version: "1.0.0",
})
await write(spec, "./generated/openapi.json")
```

## License

MIT
