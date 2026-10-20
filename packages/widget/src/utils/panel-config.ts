import type { AgentWidgetConfig, AgentWidgetConfigPatch } from "../types";

export const PANEL_WIDTH_VAR = "var(--persona-components-panel-width)";

/**
 * Provenance for legacy panel geometry aliases. Config merging materializes
 * launcher defaults, so values alone cannot distinguish a caller's alias from
 * an inherited v4 default. The enumerable symbol survives object spreads while
 * remaining absent from JSON, generated snippets, and the public config shape.
 */
export const PANEL_ALIAS_PROVENANCE = Symbol("persona.panelAliasProvenance");

export type PanelAliasProvenance = {
  launcherWidth: boolean;
  legacyLauncherWidth: boolean;
  sidebarWidth: boolean;
  dockWidth: boolean;
};

type WithPanelAliasProvenance = {
  [PANEL_ALIAS_PROVENANCE]?: PanelAliasProvenance;
};

const hasOwn = (value: object | undefined, key: string): boolean =>
  value != null && Object.prototype.hasOwnProperty.call(value, key);

const hasOwnDefined = (value: object | undefined, key: string): boolean =>
  hasOwn(value, key) && (value as Record<string, unknown>)[key] !== undefined;

const fromRawConfig = (
  config?: Partial<AgentWidgetConfig>
): PanelAliasProvenance => ({
  launcherWidth: hasOwnDefined(config?.launcher, "width"),
  legacyLauncherWidth: hasOwnDefined(config, "launcherWidth"),
  sidebarWidth: hasOwnDefined(config?.launcher, "sidebarWidth"),
  dockWidth: hasOwnDefined(config?.launcher?.dock, "width"),
});

export const getPanelAliasProvenance = (
  config?: Partial<AgentWidgetConfig>
): PanelAliasProvenance => {
  const stored = (config as WithPanelAliasProvenance | undefined)?.[PANEL_ALIAS_PROVENANCE];
  return stored ? { ...stored } : fromRawConfig(config);
};

export const setPanelAliasProvenance = <T extends object>(
  config: T,
  provenance: PanelAliasProvenance
): T => {
  Object.defineProperty(config, PANEL_ALIAS_PROVENANCE, {
    value: provenance,
    enumerable: true,
    configurable: true,
  });
  return config;
};

/** Stamp a defaulted config with aliases supplied by the raw input. */
export const inheritPanelAliasProvenance = <T extends object>(
  result: T,
  rawConfig?: Partial<AgentWidgetConfig>
): T => setPanelAliasProvenance(result, getPanelAliasProvenance(rawConfig));

/** Apply own alias keys in a live patch, including explicit-undefined resets. */
export const updatePanelAliasProvenance = (
  previous: Partial<AgentWidgetConfig>,
  patch: AgentWidgetConfigPatch
): PanelAliasProvenance => {
  // A config spread remains marked. Treat it as an already-normalized full
  // config rather than mistaking its materialized launcher defaults for a
  // patch that explicitly supplied every alias.
  const patchProvenance = (patch as WithPanelAliasProvenance)[PANEL_ALIAS_PROVENANCE];
  if (patchProvenance) return { ...patchProvenance };

  const next = getPanelAliasProvenance(previous);
  if (hasOwn(patch, "launcherWidth")) {
    next.legacyLauncherWidth = patch.launcherWidth !== undefined;
  }
  if (hasOwn(patch, "launcher") && patch.launcher === undefined) {
    next.launcherWidth = false;
    next.sidebarWidth = false;
    next.dockWidth = false;
    return next;
  }
  if (hasOwn(patch.launcher, "width")) {
    next.launcherWidth = patch.launcher?.width !== undefined;
  }
  if (hasOwn(patch.launcher, "sidebarWidth")) {
    next.sidebarWidth = patch.launcher?.sidebarWidth !== undefined;
  }
  if (hasOwn(patch.launcher, "dock") && patch.launcher?.dock === undefined) {
    next.dockWidth = false;
  } else if (hasOwn(patch.launcher?.dock, "width")) {
    next.dockWidth = patch.launcher?.dock?.width !== undefined;
  }
  return next;
};

/** Embedded presentation applies only to an inline mount, never a launcher host. */
export const isEmbeddedLayout = (config?: Partial<AgentWidgetConfig>): boolean =>
  config?.layout?.embedded === true &&
  config.launcher?.enabled === false &&
  !config.launcher.sidebarMode &&
  (config.launcher.mountMode ?? "floating") === "floating";

export const isHeaderVisible = (config?: Partial<AgentWidgetConfig>): boolean =>
  config?.layout?.showHeader ?? !isEmbeddedLayout(config);
