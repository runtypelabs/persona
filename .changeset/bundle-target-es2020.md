---
"@runtypelabs/persona": patch
---

Reduce bundle size ~14 kB gzip per bundle by raising the build target from ES2019 to ES2020, removing `?.`/`??` downleveling. No functional support change: the widget already requires newer browsers at runtime (`replaceChildren`, `Promise.allSettled`) than the ES2020 syntax floor. Also drop the unused `zod` dependency
