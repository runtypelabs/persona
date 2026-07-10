---
"@runtypelabs/persona": patch
---

Fix Vite 8 (Rolldown/Oxc) consumers: the minified dist contained an `in` expression inside a `for(init;;)` head (via an arrow body), a shape Oxc mis-parses ("Expected a semicolon") and Rolldown can silently emit as an empty chunk. The two `"message" in e` error guards are now `Reflect.has(e, "message")` (identical `[[HasProperty]]` semantics), and the build gains a dist-scan gate (`check:dist-vite8`) that fails if the toxic shape ever reappears in `dist/`.
