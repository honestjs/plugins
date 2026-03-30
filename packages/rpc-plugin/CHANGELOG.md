# @honestjs/rpc-plugin

## 1.7.9

### Patch Changes

- a047652: Fix default fetch missing its correct context when the client used on browser.

## 1.7.8

### Patch Changes

- 1fca4ed: Remove logging methods

## 1.7.7

### Patch Changes

- 6d3fc2c: Add enhanced logging system

## 1.7.6

### Patch Changes

- f6cebc2: - Increase interface typing coverage
    - Include response data in ApiError when available
    - Update dependencies

## 1.7.5

### Patch Changes

- a24ca47: - Refactor plugin orchestration to an explicit staged pipeline (analysis -> transform -> emit) with a
  dedicated coordinator.
    - Add strict generator compatibility negotiation via `supportedApiVersions` and `requiredCapabilities`.
    - Add performance regression tests for analyze latency and cache hit behavior.

## 1.7.4

### Patch Changes

- 6a960e9: Improve return type extraction to handle external symbols and ensure self-contained client

## 1.7.3

### Patch Changes

- 61f466b: Add isSyntheticTypeName utility and enhance type extraction logic

## 1.7.2

### Patch Changes

- fd63db8: Ensure request parameters types and names are correct with intersection support

## 1.7.1

### Patch Changes

- 95d5189: Update honestjs dependency to version 0.1.14

## 1.7.0

### Minor Changes

- 2fd0d6b: Update route analysis to include registered routes

## 1.6.1

### Patch Changes

- 32de849: Update honestjs dependency to version 0.1.11

## 1.6.0

### Minor Changes

- 522310d: - Add plugin `mode` (`strict`/`best-effort`) and `logLevel` controls.
    - Use decorator-based controller discovery by default and allow optional custom matcher override.
    - Add `analyze({ dryRun: true })` mode and `rpc-diagnostics.json` output.
    - Publish versioned RPC artifact contract (`artifactVersion: "1"`).

## 1.5.0

### Minor Changes

- c0e5a15: Add generators option.

## 1.4.1

### Patch Changes

- 07baee2: Fix full path generation.

## 1.4.0

### Minor Changes

- c0e89aa: Remove OpenAPI spec generation. Add artifact to context.

## 1.3.0

### Minor Changes

- e3928fe: Added OpenAPI support

## 1.2.0

### Minor Changes

- bc51d57: Removed predefined hardcoded ApiResponse

## 1.1.1

### Patch Changes

- 1c46886: Updated dependencies

## 1.1.0

### Minor Changes

- 8a16124: Added custom fetch function parameter

## 1.0.1

### Patch Changes

- 82285ac: Removed non-existent onDestroy method; Fixed memory leak; Fixed missing source file loading;

## 1.0.0

### Major Changes

- fa4a701: Initial publish.
