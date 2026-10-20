import type { AgentWidgetConfig, AgentWidgetConfigPatch } from "@runtypelabs/persona";

export type SampleScheme = "light" | "dark";
export const starterItems = ["Compare light and dark", "Try a narrow layout"];
export const welcome = {
  title: "Make the migration visible",
  subtitle: "Keep your appearance, then update each component independently.",
  variant: "card" as const,
};
export const suggestions = {
  starters: { items: starterItems, variant: "chip" as const, placement: "composer" as const, overflow: "wrap" as const, maxItems: 4 },
};

const colors = (scheme: SampleScheme) => scheme === "dark" ? {
  blue: "#c0cfff", blueSurface: "#242f4c", blueBorder: "#435781", blueText: "#d8e1fa",
  green: "#b6e6cd", greenSurface: "#233d32", amber: "#f6d29c", amberSurface: "#42321e",
  red: "#ffbec5", redSurface: "#492832", approvalSurface: "#3b3321", approvalBorder: "#786943", approvalText: "#e4d5b6",
} : {
  blue: "#3049a1", blueSurface: "#e9eefc", blueBorder: "#c5d2f0", blueText: "#24305a",
  green: "#216347", greenSurface: "#e3f3ec", amber: "#795832", amberSurface: "#fff1dd",
  red: "#9c2736", redSurface: "#ffe4e7", approvalSurface: "#fffbef", approvalBorder: "#dccfa8", approvalText: "#725f3a",
};

export function componentTheme(scheme: SampleScheme): NonNullable<AgentWidgetConfig["theme"]> {
  const c = colors(scheme);
  const control = { size: "36px", background: c.blueSurface, foreground: c.blue, borderRadius: "10px" };
  return { components: {
    header: { close: control, clear: { ...control, background: c.greenSurface, foreground: c.green } },
    composer: { send: { size: "36px", iconSize: "18px", background: "#3049a1", foreground: "#ffffff" } },
    voice: {
      control: { size: "28px", iconSize: "28px", foreground: c.amber, background: c.amberSurface },
      recording: { indicator: c.red, background: c.redSurface },
      processing: { icon: c.blue, background: c.blueSurface },
      speaking: { icon: c.green, background: c.greenSurface },
    },
    toolBubble: {
      background: c.blueSurface, borderColor: c.blueBorder, borderRadius: "14px",
      header: { foreground: c.blue, padding: "10px 16px" },
      content: { foreground: c.blueText, padding: "12px 16px" },
      codeBlock: { background: c.blueSurface, foreground: c.blueText, borderColor: c.blueBorder },
    },
    approval: {
      requested: { background: c.approvalSurface, border: c.approvalBorder, titleColor: c.amber, descriptionColor: c.approvalText, reasonColor: c.approvalText },
      approve: { background: "#216347", foreground: "#ffffff" },
    },
    suggestion: { chip: { fontWeight: "600", padding: "8px 16px" } },
    askUserQuestion: {
      sheet: { background: c.blueSurface, border: c.blueBorder },
      pill: { background: c.greenSurface, foreground: c.green, selectedBackground: "#216347", selectedForeground: "#ffffff", borderRadius: "12px" },
      customInput: { background: c.blueSurface },
    },
    artifact: {
      pane: { background: c.blueSurface, padding: "16px", borderRadius: "12px", border: `1px solid ${c.blueBorder}` },
      toolbar: { iconColor: c.blue },
    },
  } };
}

/** Intentionally retained legacy parity fixture; do not use as new authoring defaults. */
export function legacyOverrides(scheme: SampleScheme): AgentWidgetConfig {
  const c = colors(scheme);
  return {
    // Pin shared presentation in both defaults modes. V5 otherwise adapts
    // legacy starter items to its welcome-card defaults, obscuring style parity.
    welcome: { variant: "card", title: undefined, subtitle: undefined },
    suggestions: { starters: { ...suggestions.starters, items: undefined } },
    copy: { welcomeTitle: welcome.title, welcomeSubtitle: welcome.subtitle },
    suggestionChips: starterItems,
    suggestionChipsConfig: { fontWeight: "600", paddingX: "16px", paddingY: "8px" },
    launcher: {
      closeButtonSize: "36px", closeButtonBackgroundColor: c.blueSurface, closeButtonColor: c.blue, closeButtonBorderRadius: "10px",
      clearChat: { size: "36px", backgroundColor: c.greenSurface, iconColor: c.green, borderRadius: "10px" },
    },
    sendButton: { size: "36px", iconSize: "18px", backgroundColor: "#3049a1", textColor: "#ffffff" },
    voiceRecognition: {
      iconSize: "28px", iconColor: c.amber, backgroundColor: c.amberSurface,
      recordingIconColor: c.red, recordingBackgroundColor: c.redSurface,
      processingIconColor: c.blue, processingBackgroundColor: c.blueSurface,
      speakingIconColor: c.green, speakingBackgroundColor: c.greenSurface,
    },
    toolCall: {
      backgroundColor: c.blueSurface, borderColor: c.blueBorder, borderRadius: "14px",
      headerTextColor: c.blue, headerPaddingX: "16px", headerPaddingY: "10px",
      contentTextColor: c.blueText, contentPaddingX: "16px", contentPaddingY: "12px",
      codeBlockBackgroundColor: c.blueSurface, codeBlockTextColor: c.blueText, codeBlockBorderColor: c.blueBorder,
    },
    approval: {
      backgroundColor: c.approvalSurface, borderColor: c.approvalBorder, titleColor: c.amber,
      descriptionColor: c.approvalText, approveButtonColor: "#216347", approveButtonTextColor: "#ffffff",
    },
    features: {
      askUserQuestion: { styles: {
        sheetBackground: c.blueSurface, sheetBorder: c.blueBorder,
        pillBackground: c.greenSurface, pillTextColor: c.green,
        pillBackgroundSelected: "#216347", pillTextColorSelected: "#ffffff", pillBorderRadius: "12px",
        customInputBackground: c.blueSurface,
      } },
      artifacts: { layout: {
        paneBackground: c.blueSurface, panePadding: "16px", paneBorderRadius: "12px",
        paneBorder: `1px solid ${c.blueBorder}`, documentToolbarIconColor: c.blue,
      } },
    },
  };
}

// Build an own-undefined reset for the finite fixture above, retaining unrelated
// launcher behavior, question labels and artifact geometry on the live widget.
function clearFixtureFields(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key, child && typeof child === "object" && !Array.isArray(child) ? clearFixtureFields(child) : undefined,
  ]));
}
export const clearLegacyOverrides = (): AgentWidgetConfigPatch => {
  const aliases = Object.fromEntries(Object.entries(legacyOverrides("light")).filter(([key]) => key !== "welcome" && key !== "suggestions"));
  return clearFixtureFields(aliases) as AgentWidgetConfigPatch;
};
export const themeOverrides = (): AgentWidgetConfig => ({ theme: componentTheme("light"), darkTheme: componentTheme("dark") });
export const migrateOverrides = (): AgentWidgetConfigPatch => ({ ...clearLegacyOverrides(), ...themeOverrides(), welcome, suggestions });
export const resetStyleOverrides = (): AgentWidgetConfigPatch => ({ ...clearLegacyOverrides(), theme: undefined, darkTheme: undefined, welcome, suggestions });
