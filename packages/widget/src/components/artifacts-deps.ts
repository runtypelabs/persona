import type { ComponentRenderer } from "./registry";
import type { LoadingLabelRuntime } from "../loading-label-runtime-loader";
import { initLoadingLabelRuntime } from "../utils/loading-label-deps";

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
  /** Required internal renderer dependency; standalone builders must inject it. */
  loadingLabels: LoadingLabelRuntime;
  buttons?: Pick<typeof import("../utils/buttons"), "createIconButton" | "createLabelButton" | "createSplitButton" | "createToggleGroup">;
  /** Core's global componentRegistry (host-registered components live there). */
  componentRegistry: {
    get(name: string): ComponentRenderer | undefined;
  };
}

let injectedRegistry: ArtifactsUiDeps["componentRegistry"] | null = null;

export const initArtifactsUi = (deps: ArtifactsUiDeps): void => {
  injectedRegistry = deps.componentRegistry;
  initLoadingLabelRuntime(deps.loadingLabels);
  if (deps.buttons) injectedButtons = deps.buttons;
};

/** Core registry when injected; the chunk's own (empty) copy otherwise. */
export const getInjectedComponentRegistry = ():
  | ArtifactsUiDeps["componentRegistry"]
  | null => injectedRegistry;

let injectedButtons: ArtifactsUiDeps["buttons"];
export const getArtifactButtons = (): NonNullable<ArtifactsUiDeps["buttons"]> => {
  if (!injectedButtons) throw new Error("Artifact UI must be initialized with core button factories before rendering.");
  return injectedButtons;
};
