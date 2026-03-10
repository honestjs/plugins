# HonestJS plugins monorepo

This is a monorepo for the HonestJS plugins packages.

## Packages

- `@honestjs/rpc-plugin` - Analyzes HonestJS controllers and generates type-safe
  RPC clients. Publishes the analyzed artifact to application context (default
  key: `rpc.artifact`) for consumers.
- `@honestjs/api-docs-plugin` - Serves OpenAPI JSON and Swagger UI. Accepts
  an artifact object (`{ routes, schemas }`) or a context key string (for
  example `rpc.artifact`) and generates OpenAPI from it.

### RPC + API Docs integration

```ts
import { Application } from 'honestjs'
import { RPCPlugin } from '@honestjs/rpc-plugin'
import { ApiDocsPlugin } from '@honestjs/api-docs-plugin'

const { hono } = await Application.create(AppModule, {
	plugins: [new RPCPlugin(), new ApiDocsPlugin({ artifact: 'rpc.artifact' })]
})
```

## Help Wanted

We're actively seeking contributions to help grow and improve the HonestJS
plugins ecosystem! Here are some areas where we'd love your help:

### 🔧 New 3rd Party Plugins Packages

- Create plugins for popular services and APIs
- Build integrations with authentication providers
- Develop plugins for common use cases

### 🧪 Testing

- Write comprehensive unit tests for existing plugins
- Add integration tests with real-world scenarios
- Improve test coverage across all packages

### 📚 Documentation

- Write detailed usage guides and tutorials
- Create example projects and demos
- Improve packages documentation

If you're interested in contributing, please check out our issues or start a
discussion! We welcome developers of all skill levels and are happy to provide
guidance.

## License

MIT © [Orkhan Karimov](https://github.com/kerimovok)
