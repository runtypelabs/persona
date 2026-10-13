import type { AgentWidgetConfig, AgentWidgetConfigPatch } from "../types";
import { suppliedPath } from "./defaults-provenance";
import { hasExplicitStylePath, hasStyleProvenance } from "./style-provenance";

const migrations = (prefix: string, target: string, mapping: string): Record<string, string> =>
  Object.fromEntries(mapping.split(" ").map((entry) => {
    const [legacy, token] = entry.split(":");
    return [`${prefix}.${legacy}`, `theme.components.${target}.${token}`];
  }));

/** Add entries only after their scoped renderer replacement is verified. */
export const LEGACY_MIGRATIONS: Readonly<Record<string, string>> = {
  ...migrations("launcher", "header.close", "closeButtonSize:size closeButtonColor:foreground closeButtonBackgroundColor:background closeButtonBorderWidth:borderWidth closeButtonBorderColor:borderColor closeButtonBorderRadius:borderRadius closeButtonPaddingX:padding closeButtonPaddingY:padding"),
  ...migrations("launcher.clearChat", "header.clear", "size:size iconColor:foreground backgroundColor:background borderWidth:borderWidth borderColor:borderColor borderRadius:borderRadius paddingX:padding paddingY:padding"),
  ...migrations("sendButton", "composer.send", "iconSize:iconSize iconStrokeWidth:iconStrokeWidth borderWidth:borderWidth borderColor:borderColor"),
  ...migrations("voiceRecognition", "voice", "iconColor:control.foreground backgroundColor:control.background borderColor:control.borderColor borderWidth:control.borderWidth paddingX:control.padding paddingY:control.padding recordingIconColor:recording.indicator recordingBackgroundColor:recording.background recordingBorderColor:recording.border processingIconColor:processing.icon processingBackgroundColor:processing.background processingBorderColor:processing.border speakingIconColor:speaking.icon speakingBackgroundColor:speaking.background speakingBorderColor:speaking.border"),
  ...migrations("toolCall", "toolBubble", "backgroundColor:background borderColor:borderColor borderWidth:borderWidth borderRadius:borderRadius headerBackgroundColor:header.background headerTextColor:header.foreground headerPaddingX:header.padding headerPaddingY:header.padding contentBackgroundColor:content.background contentTextColor:content.foreground contentPaddingX:content.padding contentPaddingY:content.padding codeBlockBackgroundColor:codeBlock.background codeBlockBorderColor:codeBlock.borderColor codeBlockTextColor:codeBlock.foreground toggleTextColor:toggleForeground labelTextColor:labelForeground loadingAnimationColor:loading.primary loadingAnimationSecondaryColor:loading.secondary"),
  ...migrations("approval", "approval", "titleColor:requested.titleColor descriptionColor:requested.descriptionColor reasonColor:requested.reasonColor approveButtonTextColor:approve.foreground denyButtonColor:deny.background denyButtonTextColor:deny.foreground parameterBackgroundColor:requested.parameters.background parameterTextColor:requested.parameters.foreground"),
  ...migrations("features.askUserQuestion.styles", "askUserQuestion", "sheetBackground:sheet.background sheetBorder:sheet.border sheetShadow:sheet.shadow pillBackground:pill.background pillBackgroundSelected:pill.selectedBackground pillTextColor:pill.foreground pillTextColorSelected:pill.selectedForeground pillBorderRadius:pill.borderRadius customInputBackground:customInput.background"),
  ...migrations("features.artifacts.layout", "artifact", "panePadding:pane.padding paneBorderRadius:pane.borderRadius paneShadow:pane.shadow chatShadow:chat.shadow paneBorder:pane.border paneBorderLeft:pane.borderLeft unifiedSplitOuterRadius:split.outerRadius documentToolbarIconColor:toolbar.iconColor documentToolbarToggleActiveBackground:toolbar.toggleActiveBackground documentToolbarToggleActiveBorderColor:toolbar.toggleActiveBorderColor documentToolbarToggleActiveColor:toolbar.toggleActiveColor tabFadeSize:tab.fadeSize"),
  launcherWidth: "theme.components.panel.width for the open panel",
  "toolCall.shadow": "theme.components.toolBubble.shadow",
  "approval.backgroundColor": "theme.components.approval.requested.background",
  "approval.borderColor": "theme.components.approval.requested.border",
  "approval.shadow": "theme.components.approval.requested.shadow",
  "approval.approveButtonColor": "theme.components.approval.approve.background",
  "features.artifacts.layout.paneBackground": "theme.components.artifact.pane.background",
  "copy.welcomeTitle": "welcome.title (the new welcome value wins)",
  "copy.welcomeSubtitle": "welcome.subtitle (the new welcome value wins)",
  "copy.showWelcomeCard": 'welcome.variant: "none" to hide the welcome surface',
  suggestionChips: 'suggestions.starters.items; choose placement: "composer" to retain the legacy placement',
  "suggestionChipsConfig.fontWeight": "theme.components.suggestion.chip.fontWeight (chip variant only)",
  "suggestionChipsConfig.paddingX": "theme.components.suggestion.chip.padding (CSS Y X shorthand; chip variant only)",
  "suggestionChipsConfig.paddingY": "theme.components.suggestion.chip.padding (CSS Y X shorthand; chip variant only)",
  "features.suggestReplies.enabled": "suggestions.followUps.enabled (the new per-key value wins)",
  "features.suggestReplies.expose": "suggestions.followUps.expose (the new per-key value wins)",
  "sendButton.size": "theme.components.composer.send.size; preserve the legacy half-size glyph using composer.send.iconSize too",
  "sendButton.backgroundColor": "theme.components.composer.send.background (icon mode); set voice.control.background too to preserve its idle microphone fallback. The legacy field was ignored in text mode",
  "sendButton.textColor": "theme.components.composer.send.foreground; set voice.control.foreground too to preserve its idle microphone fallback",
  "sendButton.paddingX": "theme.components.composer.send.padding (CSS Y X shorthand; legacy padding applied in text mode only)",
  "sendButton.paddingY": "theme.components.composer.send.padding (CSS Y X shorthand; legacy padding applied in text mode only)",
  "voiceRecognition.iconSize": "theme.components.voice.control.size AND voice.control.iconSize to preserve both box and glyph sizing",
  "toolCall.loadingAnimationDuration": "theme.components.toolBubble.loading.duration (convert numeric milliseconds to a CSS duration, e.g. 2000 to 2000ms)",
};

/** Owned by the outer widget lifetime, including controller/layout rebuilds. */
export type LegacyDiagnosticContext = {
  warned: Set<string>;
  current: Set<string>;
  debug: boolean;
};

const report = (context: LegacyDiagnosticContext): void => {
  if (!context.debug) return;
  for (const path of context.current) {
    if (context.warned.has(path)) continue;
    console.warn(`[persona] ${path} is a supported legacy alias. Prefer ${LEGACY_MIGRATIONS[path]}. Compatibility behavior remains supported; clear the old field with an own undefined update when migrating.`);
    context.warned.add(path);
  }
};

export const createLegacyDiagnosticContext = (raw?: Partial<AgentWidgetConfig>): LegacyDiagnosticContext => {
  const context = {
    warned: new Set<string>(),
    current: new Set(Object.keys(LEGACY_MIGRATIONS).filter((path) => hasExplicitStylePath(raw, path))),
    debug: raw?.debug === true,
  };
  report(context);
  return context;
};

/** Called once at the raw-host patch boundary; resolved inner merges never report. */
export const updateLegacyDiagnostics = (context: LegacyDiagnosticContext, patch: AgentWidgetConfigPatch): void => {
  if (hasStyleProvenance(patch)) {
    context.current = new Set(Object.keys(LEGACY_MIGRATIONS).filter((path) => hasExplicitStylePath(patch, path)));
  } else {
    for (const path of Object.keys(LEGACY_MIGRATIONS)) {
      const state = suppliedPath(patch, path);
      if (state === "clear") context.current.delete(path);
      if (state === "explicit") context.current.add(path);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "debug")) context.debug = patch.debug === true;
  report(context);
};
