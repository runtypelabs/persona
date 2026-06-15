/**
 * Critical-path launcher entry: built to `launcher.global.js` (IIFE).
 *
 * Ships ONLY the real collapsed launcher (`createLauncherButton`) plus the
 * theme application path, so the launcher paints pixel-identically to the full
 * widget from a tiny bundle. The heavy conversation panel is deferred until
 * first open by the installer (Phase 2).
 *
 * The full Lucide icon registry is kept on purpose: any *supported* icon a site
 * configures (`launcher.agentIconName` / `callToActionIconName`) must render at
 * first paint with no flash, and the only synchronously-available source is this
 * bundle. See the "Deferred Launcher Loading" pattern in CLAUDE.md.
 *
 * Public global (via tsup `--global-name AgentWidgetLauncher`):
 *
 *   window.AgentWidgetLauncher.mount({ target, config, onOpen })
 *     → { root, element, update, destroy }
 */
import { createLauncherButton } from "./components/launcher";
import { applyThemeVariables } from "./utils/theme";
import { DEFAULT_LAUNCHER_CONFIG } from "./defaults";
import type { AgentWidgetConfig } from "./types";

export interface AgentWidgetLauncherMountOptions {
  /** Where to mount. Defaults to `document.body` (the floating launcher is `position: fixed`). */
  target?: string | HTMLElement;
  /** The same widget config the full widget will receive: drives theme, icons, position, copy. */
  config?: AgentWidgetConfig;
  /** Called when the launcher is clicked; the installer loads the full widget and opens the panel. */
  onOpen: () => void;
}

export interface AgentWidgetLauncherHandle {
  /** The `[data-persona-root]` wrapper that carries the theme CSS variables. */
  root: HTMLElement;
  /** The launcher button element itself. */
  element: HTMLButtonElement;
  /** Re-apply theme + re-render the launcher with new config. */
  update: (config: AgentWidgetConfig) => void;
  /** Remove the critical launcher (called at handoff once the full widget is mounted). */
  destroy: () => void;
}

/**
 * Marks the critical launcher's wrapper so the installer can find/remove it at
 * handoff without disturbing the full widget's own `[data-persona-root]`.
 */
export const CRITICAL_LAUNCHER_ATTR = "data-persona-launcher-critical";

const resolveTarget = (target?: string | HTMLElement): HTMLElement => {
  if (target instanceof HTMLElement) return target;
  if (typeof target === "string") {
    const el = document.querySelector<HTMLElement>(target);
    if (el) return el;
  }
  return document.body;
};

const mergeCriticalLauncherConfig = (
  config?: AgentWidgetConfig
): AgentWidgetConfig => ({
  ...config,
  launcher: {
    ...DEFAULT_LAUNCHER_CONFIG,
    ...config?.launcher,
    dock: {
      ...DEFAULT_LAUNCHER_CONFIG.dock,
      ...config?.launcher?.dock,
    },
  },
});

/**
 * Mount the real collapsed launcher from the critical bundle.
 *
 * Mirrors the full widget's DOM exactly (`runtime/init.ts` + `ui.ts`): a
 * `[data-persona-root]` wrapper carries the theme CSS variables and the launcher
 * button is its child. Keeping the theme vars on the wrapper (not the button)
 * leaves the button's own inline style byte-identical to the full widget's, so
 * the eventual mount-then-remove handoff is invisible.
 */
export const mount = (
  options: AgentWidgetLauncherMountOptions
): AgentWidgetLauncherHandle => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      "AgentWidgetLauncher can only be mounted in a browser environment"
    );
  }

  const { onOpen } = options;
  const target = resolveTarget(options.target);

  // Render from the same launcher defaults the full widget uses without pulling
  // the full widget default object into the critical bundle.
  const config = mergeCriticalLauncherConfig(options.config);

  const root = document.createElement("div");
  root.setAttribute("data-persona-root", "true");
  root.setAttribute(CRITICAL_LAUNCHER_ATTR, "true");
  applyThemeVariables(root, config);

  const launcher = createLauncherButton(config, onOpen);
  root.appendChild(launcher.element);
  target.appendChild(root);

  return {
    root,
    element: launcher.element,
    update: (next: AgentWidgetConfig) => {
      const merged = mergeCriticalLauncherConfig(next);
      applyThemeVariables(root, merged);
      launcher.update(merged);
    },
    destroy: () => {
      launcher.destroy();
      root.remove();
    },
  };
};

// Note: the `window.AgentWidgetLauncher` global is created by tsup's
// `--global-name AgentWidgetLauncher` at build time. The installer
// (`install.ts`) declares the `Window` augmentation it needs; this entry never
// reads the global, so re-declaring it here would only create a cross-file type
// conflict.
