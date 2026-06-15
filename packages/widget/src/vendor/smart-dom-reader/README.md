# Vendored: `@mcp-b/smart-dom-reader`

This directory contains a **vendored copy** of [`@mcp-b/smart-dom-reader`](https://github.com/WebMCP-org/npm-packages/tree/main/packages/smart-dom-reader)
(v2.3.1, MIT, © 2025 mcp-b contributors), consumed only by the optional
`@runtypelabs/persona/smart-dom-reader` entry point (`src/smart-dom-reader.ts`)
and the pure mapper (`src/utils/smart-dom-adapter.ts`, type-only).

## Why vendored instead of a dependency

Every published version of the package (2.3.1, 2.3.2, 3.0.0) is **mis-published**:
its `package.json` declares

```json
"main":    "./dist/index.js",
"types":   "./dist/index.d.ts",
"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
```

but the build tool (`vp pack`, vite-plus/rolldown) only emits `dist/index.mjs` +
`dist/index.d.mts`. The files referenced by `package.json` are **absent from the
tarball**, so the package cannot be imported by name in Node or any bundler
(`ERR_MODULE_NOT_FOUND`), and TypeScript cannot resolve its types. This affects
the package itself and every downstream consumer, so making it an optional peer
dependency would ship a feature that no integrator could actually load.

Vendoring the built artifact into this opt-in entry sidesteps the broken module
resolution entirely: the code is bundled into `dist/smart-dom-reader.{js,cjs}`
and never touches a package resolver. Consumers who never import the
`/smart-dom-reader` entry pay nothing.

> **Follow-up:** raise the packaging bug with the upstream maintainer. Once a
> corrected release exists, this vendor dir can be replaced with a normal
> optional peer dependency (see the original plan).

## Files

- `index.js`: upstream `dist/index.mjs`, with two local edits (see header comment).
- `index.d.ts`: upstream `dist/index.d.mts` verbatim (sourceMappingURL stripped).
- `LICENSE`: upstream MIT license.

## Local modifications to `index.js`

The **only** changes from upstream `dist/index.mjs` are:

1. Removed the top-level `import { createRequire } from "node:module";`: a
   Node-only builtin that breaks browser bundling.
2. Replaced `var __require = createRequire(import.meta.url);` with
   `var __require = void 0;`. `__require` is referenced only inside a guarded
   `typeof __require === "function"` Node fallback in `resolveSmartDomReader()`;
   the browser path (`typeof window !== "undefined"`) returns before reaching it,
   so this is a runtime no-op in the browser.

## How to update

1. `npm pack @mcp-b/smart-dom-reader@<version>` and extract the tarball.
2. Copy `dist/index.mjs` → `index.js` and `dist/index.d.mts` → `index.d.ts`.
3. Re-apply the two edits above (strip the `node:module` import; neutralize
   `__require`) and the provenance headers. Strip trailing `sourceMappingURL`
   comments.
4. Copy the upstream `LICENSE`.
5. Re-run `pnpm --filter @runtypelabs/persona build typecheck test:run`.
