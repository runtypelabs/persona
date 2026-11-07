---
"@runtypelabs/persona": patch
---

Move the widget's TypeScript dev dependency to 7, and stop runtime builds from running declaration emit: tsdown enabled it implicitly, and it reshaped the JS chunks. Lazy chunks are about 2 KB gzip smaller in total, and `artifacts-ui` no longer loads a separate helper chunk. Published types are unchanged.
