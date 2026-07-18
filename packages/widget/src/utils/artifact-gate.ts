import type { AgentWidgetConfig, PersonaArtifactKind } from "../types";

export function artifactsSidebarEnabled(config: AgentWidgetConfig | undefined): boolean {
  return config?.features?.artifacts?.enabled === true;
}

export function artifactKindAllowedByFeature(
  config: AgentWidgetConfig | undefined,
  kind: PersonaArtifactKind
): boolean {
  const allowed = config?.features?.artifacts?.allowedTypes;
  if (!allowed?.length) return true;
  return allowed.includes(kind);
}

/** Optional custom border on artifact pane via CSS vars + root classes. */
export function applyArtifactPaneBorderTheme(mount: HTMLElement, config: AgentWidgetConfig): void {
  mount.classList.remove("persona-artifact-border-full", "persona-artifact-border-left");
  mount.style.removeProperty("--persona-artifact-pane-border");
  mount.style.removeProperty("--persona-artifact-pane-border-left");
  if (!artifactsSidebarEnabled(config)) return;

  const l = config.features?.artifacts?.layout;
  const full = l?.paneBorder?.trim();
  const left = l?.paneBorderLeft?.trim();
  if (full) {
    mount.classList.add("persona-artifact-border-full");
    mount.style.setProperty("--persona-artifact-pane-border", full);
  } else if (left) {
    mount.classList.add("persona-artifact-border-left");
    mount.style.setProperty("--persona-artifact-pane-border-left", left);
  }
}

/** Set CSS variables on the widget root for artifact split/pane sizing. Clears when artifacts disabled. */
function clearDocumentToolbarLayoutVars(mount: HTMLElement): void {
  mount.style.removeProperty("--persona-artifact-doc-toolbar-icon-color");
  mount.style.removeProperty("--persona-artifact-doc-toggle-active-bg");
  mount.style.removeProperty("--persona-artifact-doc-toggle-active-border");
}

const ARTIFACT_APPEARANCE_MODES = ["panel", "seamless", "detached"] as const;
type ArtifactAppearance = (typeof ARTIFACT_APPEARANCE_MODES)[number];

/** Resolve the effective pane appearance, applying the detached-panel coordinated default. */
function resolveArtifactPaneAppearance(config: AgentWidgetConfig): ArtifactAppearance {
  const raw = config.features?.artifacts?.layout?.paneAppearance;
  if (raw && (ARTIFACT_APPEARANCE_MODES as readonly string[]).includes(raw)) {
    return raw as ArtifactAppearance;
  }
  if (raw) return "panel";
  // Coordinated default: a detached panel gets a detached pane unless overridden.
  return config.launcher?.detachedPanel ? "detached" : "panel";
}

/** True when the effective pane appearance resolves to "detached" (explicit or coordinated default). */
export function isArtifactPaneAppearanceDetached(config: AgentWidgetConfig | undefined): boolean {
  if (!config || !artifactsSidebarEnabled(config)) return false;
  return resolveArtifactPaneAppearance(config) === "detached";
}

export function applyArtifactLayoutCssVars(mount: HTMLElement, config: AgentWidgetConfig): void {
  if (!artifactsSidebarEnabled(config)) {
    mount.style.removeProperty("--persona-artifact-split-gap");
    mount.style.removeProperty("--persona-artifact-pane-width");
    mount.style.removeProperty("--persona-artifact-pane-max-width");
    mount.style.removeProperty("--persona-artifact-pane-min-width");
    mount.style.removeProperty("--persona-artifact-pane-bg");
    mount.style.removeProperty("--persona-artifact-pane-padding");
    clearDocumentToolbarLayoutVars(mount);
    applyArtifactPaneBorderTheme(mount, config);
    return;
  }
  const l = config.features?.artifacts?.layout;
  // Detached shows the canvas between columns; panel/seamless weld at gap 0.
  const gapDefault =
    resolveArtifactPaneAppearance(config) === "detached"
      ? "var(--persona-panel-inset)"
      : "0";
  mount.style.setProperty("--persona-artifact-split-gap", l?.splitGap ?? gapDefault);
  mount.style.setProperty("--persona-artifact-pane-width", l?.paneWidth ?? "40%");
  mount.style.setProperty("--persona-artifact-pane-max-width", l?.paneMaxWidth ?? "28rem");
  if (l?.paneMinWidth) {
    mount.style.setProperty("--persona-artifact-pane-min-width", l.paneMinWidth);
  } else {
    mount.style.removeProperty("--persona-artifact-pane-min-width");
  }
  const paneBg = l?.paneBackground?.trim();
  if (paneBg) {
    mount.style.setProperty("--persona-artifact-pane-bg", paneBg);
  } else {
    mount.style.removeProperty("--persona-artifact-pane-bg");
  }
  const panePad = l?.panePadding?.trim();
  if (panePad) {
    mount.style.setProperty("--persona-artifact-pane-padding", panePad);
  } else {
    mount.style.removeProperty("--persona-artifact-pane-padding");
  }

  const iconColor = l?.documentToolbarIconColor?.trim();
  if (iconColor) {
    mount.style.setProperty("--persona-artifact-doc-toolbar-icon-color", iconColor);
  } else {
    mount.style.removeProperty("--persona-artifact-doc-toolbar-icon-color");
  }
  const toggleBg = l?.documentToolbarToggleActiveBackground?.trim();
  if (toggleBg) {
    mount.style.setProperty("--persona-artifact-doc-toggle-active-bg", toggleBg);
  } else {
    mount.style.removeProperty("--persona-artifact-doc-toggle-active-bg");
  }
  const toggleBorder = l?.documentToolbarToggleActiveBorderColor?.trim();
  if (toggleBorder) {
    mount.style.setProperty("--persona-artifact-doc-toggle-active-border", toggleBorder);
  } else {
    mount.style.removeProperty("--persona-artifact-doc-toggle-active-border");
  }

  applyArtifactPaneBorderTheme(mount, config);
}

/** Toggle root classes for artifact pane appearance, radius, and shadow vars. */
export function applyArtifactPaneAppearance(mount: HTMLElement, config: AgentWidgetConfig): void {
  for (const m of ARTIFACT_APPEARANCE_MODES) {
    mount.classList.remove(`persona-artifact-appearance-${m}`);
  }
  mount.style.removeProperty("--persona-artifact-pane-radius");
  mount.style.removeProperty("--persona-artifact-pane-shadow");
  mount.style.removeProperty("--persona-artifact-chat-shadow");
  if (!artifactsSidebarEnabled(config)) return;

  const layout = config.features?.artifacts?.layout;
  const mode = resolveArtifactPaneAppearance(config);
  mount.classList.add(`persona-artifact-appearance-${mode}`);

  const radius = layout?.paneBorderRadius?.trim();
  if (radius) {
    mount.style.setProperty("--persona-artifact-pane-radius", radius);
  }

  const shadow = layout?.paneShadow?.trim();
  if (shadow) {
    mount.style.setProperty("--persona-artifact-pane-shadow", shadow);
  }

  // Chat card gains its own front shadow lookup so a detached split can flatten
  // the chat column while the pane stays raised. Unset falls back to the pane chain.
  const chatShadow = layout?.chatShadow?.trim();
  if (chatShadow) {
    mount.style.setProperty("--persona-artifact-chat-shadow", chatShadow);
  }

  // Panel/seamless splits weld by default; `unifiedSplitChrome` is a deprecated
  // no-op. The welded outer-right radius (`--persona-artifact-welded-outer-radius`)
  // is owned by ui.ts syncPanelChrome so it derives from the same resolved panel
  // radius as the chat card; `unifiedSplitOuterRadius` / `paneBorderRadius` win there.
}

/** Widen floating panel when artifacts show (default true); `false` opts out. */
export function shouldExpandLauncherForArtifacts(
  config: AgentWidgetConfig,
  launcherEnabled: boolean
): boolean {
  if (!launcherEnabled || !artifactsSidebarEnabled(config)) return false;
  return config.features?.artifacts?.layout?.expandLauncherPanelWhenOpen !== false;
}
