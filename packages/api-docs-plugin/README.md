# API Docs Plugin

Serves OpenAPI JSON and Swagger UI for your HonestJS application. Always
generates the spec from an artifact-pass `{ routes, schemas }` directly or a
context key (default `'rpc.artifact'` when using with `@honestjs/rpc-plugin`).

## Installation

```bash
npm install @honestjs/api-docs-plugin
# or
yarn add @honestjs/api-docs-plugin
# or
pnpm add @honestjs/api-docs-plugin
```

## Usage with RPC Plugin

The RPC plugin writes its artifact to the application context. ApiDocs defaults
to the context key `'rpc.artifact'`, so you can omit `artifact` when using both
plugins. Ensure RPC runs before ApiDocs in the plugins array:

```typescript
import { Application } from "honestjs";
import { RPCPlugin } from "@honestjs/rpc-plugin";
import { ApiDocsPlugin } from "@honestjs/api-docs-plugin";
import AppModule from "./app.module";

const { hono } = await Application.create(AppModule, {
  plugins: [new RPCPlugin(), new ApiDocsPlugin()],
});

export default hono;
```

If RPC uses custom `context.namespace` / `context.keys.artifact`, pass the
resulting full key to `artifact` (e.g.
`new ApiDocsPlugin({ artifact: "custom.artifact" })`).

By default:

- OpenAPI JSON: `/openapi.json`
- Swagger UI: `/docs`

## Manual Artifact

Pass the artifact object directly:

```typescript
import { ApiDocsPlugin } from "@honestjs/api-docs-plugin";

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
};

plugins: [new ApiDocsPlugin({ artifact })];
```

## Configuration Options

```typescript
interface ApiDocsPluginOptions {
  // Optional: artifact - direct object or context key. Default: 'rpc.artifact'
  artifact?: OpenApiArtifactInput | string;

  // OpenAPI generation (when converting artifact to spec)
  title?: string;
  version?: string;
  description?: string;
  servers?: readonly { url: string; description?: string }[];

  // Serving
  openApiRoute?: string; // default: '/openapi.json'
  uiRoute?: string; // default: '/docs'
  uiTitle?: string; // default: 'API Docs'
  reloadOnRequest?: boolean; // default: false
  onOpenApiRequest?: (c, next) => void | Response | Promise<void | Response>; // optional auth hook
  onUiRequest?: (c, next) => void | Response | Promise<void | Response>; // optional auth hook
}
```

If artifact contains `artifactVersion`, supported value is currently `"1"`.

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

## Route Auth Hooks

Use optional hooks to protect docs routes:

```typescript
const plugin = new ApiDocsPlugin({
  artifact: "rpc.artifact",
  onOpenApiRequest: async (c, next) => {
    if (c.req.header("x-api-key") !== "secret") {
      return new Response("Unauthorized", { status: 401 });
    }
    await next();
  },
  onUiRequest: async (_c, next) => {
    await next();
  },
});
```

## Known Limitations

- When `artifact` is a context key, the producer plugin must run before
  `ApiDocsPlugin` and write a valid artifact object to that key.
- OpenAPI generation currently reflects artifact shape and inferred primitive
  parameter types; advanced custom schema mappings should be done upstream in
  the artifact producer.
- Swagger UI is served from CDN assets by default; environments with restricted
  outbound access should account for this.

## License

MIT
