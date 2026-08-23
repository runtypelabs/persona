/**
 * Subpath/chunk module for the lazy demo-forms enhancement
 * (`@runtypelabs/persona/forms-ui` → `dist/forms-ui.{js,cjs}`).
 *
 * Transport-entry only: re-exports the `[data-tv-form]` placeholder
 * enhancement from `components/forms`. The core bundle loads this on demand
 * via `forms-ui-loader.ts` — the IIFE from a sibling URL, ESM/CJS via this
 * external subpath.
 */
export { enhanceWithForms, formDefinitions } from "./components/forms";
