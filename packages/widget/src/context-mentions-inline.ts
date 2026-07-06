/**
 * Public entry for the lazy inline-mention chunk (`dist/context-mentions-inline.js`).
 *
 * Loaded on composer mount when `contextMentions.display === "inline"`. Carries
 * the contenteditable engine (`composer-document`, `composer-contenteditable`)
 * so chip-only and feature-off sites never download it. See
 * `context-mentions-inline-loader.ts` and the loader registration in
 * `index-global.ts`.
 */

export { mountInlineComposer } from "./context-mentions-inline-entry";
export type {
  InlineComposerMountContext,
  InlineComposerHandle,
} from "./context-mentions-inline-entry";
