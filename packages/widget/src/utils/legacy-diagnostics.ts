import { loadConfigDiagnostics, getConfigDiagnosticsSync } from "../config-diagnostics-loader";
import type { AgentWidgetConfig, AgentWidgetConfigPatch } from "../types";
import { suppliedPath } from "./defaults-provenance";
import { hasExplicitStylePath, hasStyleProvenance, LEGACY_STYLE_PATHS } from "./style-provenance";

const DIAGNOSTIC_PATHS = [...LEGACY_STYLE_PATHS, "launcherWidth", "suggestionChips", "copy.welcomeTitle", "copy.welcomeSubtitle", "copy.showWelcomeCard", "features.suggestReplies.enabled", "features.suggestReplies.expose"];

/** Owned by the outer widget lifetime, including controller/layout rebuilds. */
export type LegacyDiagnosticContext = {
  warned: Set<string>;
  current: Set<string>;
  debug: boolean;
};

const report = (context: LegacyDiagnosticContext): void => {
  if (!context.debug) return;
  const runtime = getConfigDiagnosticsSync();
  if (!runtime) {
    void loadConfigDiagnostics().then(() => report(context), () => {});
    return;
  }
  for (const path of context.current) {
    if (!(path in runtime.LEGACY_MIGRATIONS)) continue;
    if (context.warned.has(path)) continue;
    console.warn(`[persona] ${path} is a supported legacy alias. Prefer ${runtime.LEGACY_MIGRATIONS[path]}. Compatibility behavior remains supported; clear the old field with an own undefined update when migrating.`);
    context.warned.add(path);
  }
};

export const createLegacyDiagnosticContext = (raw?: Partial<AgentWidgetConfig>): LegacyDiagnosticContext => {
  const context = {
    warned: new Set<string>(),
    current: new Set(DIAGNOSTIC_PATHS.filter((path) => hasExplicitStylePath(raw, path))),
    debug: raw?.debug === true,
  };
  report(context);
  return context;
};

/** Called once at the raw-host patch boundary; resolved inner merges never report. */
export const updateLegacyDiagnostics = (context: LegacyDiagnosticContext, patch: AgentWidgetConfigPatch): void => {
  if (hasStyleProvenance(patch)) {
    context.current = new Set(DIAGNOSTIC_PATHS.filter((path) => hasExplicitStylePath(patch, path)));
  } else {
    for (const path of DIAGNOSTIC_PATHS) {
      const state = suppliedPath(patch, path);
      if (state === "clear") context.current.delete(path);
      if (state === "explicit") context.current.add(path);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "debug")) context.debug = patch.debug === true;
  report(context);
};
