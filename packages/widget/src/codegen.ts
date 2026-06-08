/**
 * Pure code-snippet generation entry (`@runtypelabs/persona/codegen`).
 *
 * `generateCodeSnippet` is pure string-templating — it builds install snippets
 * from a widget config and depends only on a type import + the `VERSION`
 * constant. The main `index.ts` barrel re-exports it too, but that barrel pulls
 * in the full widget runtime (`index-core` → idiomorph / marked / DOM), which is
 * unacceptable for server/Worker consumers that only need snippet strings.
 *
 * This subpath exposes the generator on its own (mirroring `theme-reference`) so
 * those consumers import it without dragging in the browser runtime. Existing
 * npm consumers keep using the barrel export unchanged.
 */

export { generateCodeSnippet } from "./utils/code-generators";
export type {
  CodeFormat,
  CodeGeneratorHooks,
  CodeGeneratorOptions
} from "./utils/code-generators";
