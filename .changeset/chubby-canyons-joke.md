---
"@honestjs/rpc-plugin": minor
---

- Add plugin `mode` (`strict`/`best-effort`) and `logLevel` controls.
- Use decorator-based controller discovery by default and allow optional custom
  matcher override.
- Add `analyze({ dryRun: true })` mode and `rpc-diagnostics.json` output.
- Publish versioned RPC artifact contract (`artifactVersion: "1"`).
