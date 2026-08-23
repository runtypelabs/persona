import type { ComponentRenderer } from "./registry";

/**
 * Injected core dependencies for the lazy artifacts-ui chunk.
 *
 * The chunk is bundled `noExternal`, so importing the global
 * `componentRegistry` here would resolve component artifacts against the
 * CHUNK'S own (empty) registry copy instead of the one hosts register into.
 * The adoption step in `artifacts-ui-loader.ts` injects core's registry
 * before any artifact renders. (The chunk's copies of the markdown-parsers
 * and icons-extra loader slots are synchronized separately — see the
 * `__provideMarkdownParsers` / `__setIconsExtraLoader` re-exports in
 * `artifacts-ui-entry.ts`.)
 */
export interface ArtifactsUiDeps {
  /** Core's global componentRegistry (host-registered components live there). */
  componentRegistry: {
    get(name: string): ComponentRenderer | undefined;
  };
}

let injectedRegistry: ArtifactsUiDeps["componentRegistry"] | null = null;

export const initArtifactsUi = (deps: ArtifactsUiDeps): void => {
  injectedRegistry = deps.componentRegistry;
};

/** Core registry when injected; the chunk's own (empty) copy otherwise. */
export const getInjectedComponentRegistry = ():
  | ArtifactsUiDeps["componentRegistry"]
  | null => injectedRegistry;
