/**
 * Subpath/chunk module for the lazy artifacts UI
 * (`@runtypelabs/persona/artifacts-ui` → `dist/artifacts-ui.{js,cjs}`).
 *
 * Transport-entry only: re-exports the mount contract from
 * `./artifacts-ui-entry`. Core loads this on demand via
 * `artifacts-ui-loader.ts` — the IIFE from a sibling URL, ESM/CJS via this
 * external subpath — when the artifacts sidebar is enabled or an artifact
 * component directive first arrives.
 */
export {
  createArtifactPane,
  hasLiveInlineArtifactBlock,
  updateInlineArtifactBlocks,
  PersonaArtifactInline,
  PersonaArtifactCard,
  artifactCopyText,
  downloadInfoFor,
  triggerArtifactDownload,
  initArtifactsUi,
  __provideMarkdownParsers,
  __setIconsExtraLoader,
} from "./artifacts-ui-entry";
export type { ArtifactPaneApi, ArtifactsUiDeps } from "./artifacts-ui-entry";
