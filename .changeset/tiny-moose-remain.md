---
'@honestjs/rpc-plugin': patch
---

- Refactor plugin orchestration to an explicit staged pipeline (analysis -> transform -> emit) with a dedicated
  coordinator.
- Add strict generator compatibility negotiation via `supportedApiVersions` and `requiredCapabilities`.
- Add performance regression tests for analyze latency and cache hit behavior.
