/**
 * Runtime entry for the lazy artifacts-ui chunk: the artifact pane, the
 * inline/card transcript components, the shared preview renderer, and the
 * file download/copy helpers.
 *
 * NEVER statically imported on the core path — core reaches it only through
 * `artifacts-ui-loader.ts` (whose adoption step also registers the built-in
 * components into core's componentRegistry and synchronizes this chunk's own
 * copies of the markdown-parsers and icons-extra loader slots — see the
 * `__`-prefixed re-exports below).
 */
export { createArtifactPane } from "./components/artifact-pane";
export type { ArtifactPaneApi } from "./components/artifact-pane";
export {
  hasLiveInlineArtifactBlock,
  updateInlineArtifactBlocks,
  PersonaArtifactInline,
} from "./components/artifact-inline";
export { PersonaArtifactCard } from "./components/artifact-card";
export { artifactCopyText } from "./components/artifact-preview";
export { downloadInfoFor, triggerArtifactDownload } from "./utils/artifact-file";
export { initArtifactsUi } from "./components/artifacts-deps";
export type { ArtifactsUiDeps } from "./components/artifacts-deps";

// Copy-sync surface: because this chunk is bundled `noExternal`, it carries
// its OWN copies of the markdown-parsers loader (via postprocessors/sanitize/
// artifact-preview) and the icon registry + icons-extra loader (via
// utils/buttons). The adoption step pipes core's state into them:
//  - `__provideMarkdownParsers(mod)` — called with core's parsers when they
//    are (or become) loaded, so preview markdown renders instead of staying
//    escaped against an empty copy;
//  - `__setIconsExtraLoader(fn)` — pointed at core's `loadIconsExtra`, so an
//    extra-tier icon name reaching this chunk's registry copy fetches through
//    core's sibling-URL loader instead of a bare subpath import.
export { provideMarkdownParsers as __provideMarkdownParsers } from "./markdown-parsers-loader";
export { setIconsExtraLoader as __setIconsExtraLoader } from "./icons-extra-loader";
