---
"@runtypelabs/persona": minor
---

Add a server/Worker-safe `@runtypelabs/persona/codegen` subpath export that exposes `generateCodeSnippet` (and its `CodeFormat` / `CodeGeneratorHooks` / `CodeGeneratorOptions` types) without pulling in the browser widget runtime. Snippet generation is pure string-templating, so consumers that only need to emit embed code (server-side renderers, Cloudflare Workers, CLIs) can import it without dragging in idiomorph/marked/DOM code. The main barrel export is unchanged.
