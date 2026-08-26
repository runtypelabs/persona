---
"@runtypelabs/persona": patch
---

Sync the generated Runtype OpenAPI contract with the live spec. `execution_start` now includes optional `resumed`, which was breaking the `check:runtype-types` CI gate.
