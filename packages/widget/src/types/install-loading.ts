/** Context supplied by the script installer's delayed loading surface. */
export interface InstallLoadingContext {
  /** Connected, absolutely positioned status container. Add your UI here.
   * Persona removes it automatically; do not replace the target's contents. */
  container: HTMLElement;
  /** Embedded host, or the retained floating launcher button. */
  target: HTMLElement;
  kind: "embedded" | "launcher";
}

/** Synchronous renderer called only if installation is still pending after
 * 300ms. Return optional cleanup for listeners, animations, or subscriptions.
 * Cleanup runs once on success or failure; a retry gets a new container.
 * This installer-only hook belongs on window.siteAgentConfig, outside config. */
export type InstallLoadingRenderer = (context: InstallLoadingContext) => void | (() => void);
