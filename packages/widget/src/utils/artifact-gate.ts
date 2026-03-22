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

/** Set CSS variables on #persona-root for artifact split/pane sizing. Clears when artifacts disabled. */
function clearDocumentToolbarLayoutVars(mount: HTMLElement): void {
  mount.style.removeProperty("--persona-artifact-doc-toolbar-icon-color");
  mount.style.removeProperty("--persona-artifact-doc-toggle-active-bg");
  mount.style.removeProperty("--persona-artifact-doc-toggle-active-border");
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
  mount.style.setProperty("--persona-artifact-split-gap", l?.splitGap ?? "0.5rem");
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

const ARTIFACT_APPEARANCE_MODES = ["panel", "seamless"] as const;

/** Toggle root classes for artifact pane appearance, radius, shadow, and unified chrome. */
export function applyArtifactPaneAppearance(mount: HTMLElement, config: AgentWidgetConfig): void {
  for (const m of ARTIFACT_APPEARANCE_MODES) {
    mount.classList.remove(`persona-artifact-appearance-${m}`);
  }
  mount.classList.remove("persona-artifact-unified-split");
  mount.style.removeProperty("--persona-artifact-pane-radius");
  mount.style.removeProperty("--persona-artifact-pane-shadow");
  mount.style.removeProperty("--persona-artifact-unified-outer-radius");
  if (!artifactsSidebarEnabled(config)) return;

  const layout = config.features?.artifacts?.layout;
  const raw = layout?.paneAppearance ?? "panel";
  const mode = (ARTIFACT_APPEARANCE_MODES as readonly string[]).includes(raw) ? raw : "panel";
  mount.classList.add(`persona-artifact-appearance-${mode}`);

  const radius = layout?.paneBorderRadius?.trim();
  if (radius) {
    mount.style.setProperty("--persona-artifact-pane-radius", radius);
  }

  const shadow = layout?.paneShadow?.trim();
  if (shadow) {
    mount.style.setProperty("--persona-artifact-pane-shadow", shadow);
  }

  if (layout?.unifiedSplitChrome === true) {
    mount.classList.add("persona-artifact-unified-split");
    const outer = layout.unifiedSplitOuterRadius?.trim() || radius;
    if (outer) {
      mount.style.setProperty("--persona-artifact-unified-outer-radius", outer);
    }
  }
}

/** Widen floating panel when artifacts show (default true); `false` opts out. */
export function shouldExpandLauncherForArtifacts(
  config: AgentWidgetConfig,
  launcherEnabled: boolean
): boolean {
  if (!launcherEnabled || !artifactsSidebarEnabled(config)) return false;
  return config.features?.artifacts?.layout?.expandLauncherPanelWhenOpen !== false;
}
