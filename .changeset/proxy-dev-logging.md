---
"@runtypelabs/persona-proxy": patch
---

Read `NODE_ENV` and `RUNTYPE_API_KEY` through a runtime-safe env helper (works when `process` is absent), and keep verbose dispatch logs—API key prefix and full JSON payload—strictly in development.
