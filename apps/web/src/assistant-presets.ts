import type { AgentWidgetConfig } from "@runtypelabs/persona";

type Preset = {
  id: string; name: string; source: string; evidence: string;
  title: string; placeholder: string; width: number; radius: string;
  canvas: string; surface: string; text: string; muted: string; border: string;
  layout: "stacked" | "single-row"; model?: string;
  matches: string[]; gaps: string[];
};

/** Observed October 7, 2026. References are variants, not universal product defaults. */
export const assistantPresets: Preset[] = [
  {
    id: "chatgpt", name: "ChatGPT", source: "https://chatgpt.com/",
    evidence: "Live signed-out interface, dark compact composer. Signed-in Work uses a different, stacked variant.",
    title: "What are you working on?", placeholder: "Ask ChatGPT", width: 768, radius: "28px",
    canvas: "#000000", surface: "#212121", text: "#f3f3f3", muted: "#a5a5a5", border: "transparent", layout: "single-row",
    matches: ["Compact composer and neutral dark palette", "Leading + menu and voice-to-send swap", "Centered welcome that disappears after sending"],
    gaps: ["Original vertical audio bars approximate the proprietary voice glyph", "System typography follows the observed platform stack; no product sidebar or account controls", "The reference is the signed-out variant; signed-in tools and model selection differ"],
  },
  {
    id: "claude", name: "Claude", source: "https://claude.ai/new",
    evidence: "Live signed-in empty conversation: approximately 640px × 103px composer, 14px corners, Chat / Cowork and a model picker.",
    title: "You’re here!", placeholder: "How can I help you today?", width: 640, radius: "14px",
    canvas: "#faf9f5", surface: "#ffffff", text: "#262624", muted: "#73726c", border: "#deddd7", layout: "stacked", model: "Opus 5.5",
    matches: ["Serif greeting with an inline glyph", "Writing row above +, Chat / Cowork, model, and voice controls", "Soft shadow, warm canvas, white composer, and restrained corners"],
    gaps: ["Georgia and an original radial symbol approximate the proprietary typeface and logo", "Chat / Cowork changes local mode state; it does not launch separate workspaces", "Starter icons are generic; proprietary artwork and fonts are not included"],
  },
  {
    id: "gemini", name: "Gemini", source: "https://gemini.google.com/app",
    evidence: "Live signed-in empty conversation: approximately 662px × 64px pill with +, Pro, and dictation.",
    title: "Where should we start?", placeholder: "Ask Gemini", width: 662, radius: "9999px",
    canvas: "#ffffff", surface: "#ffffff", text: "#242628", muted: "#6c7075", border: "#e8edf4", layout: "single-row", model: "Pro",
    matches: ["Single-row pill with trailing model picker and microphone", "Send appears only when there is a draft", "Large centered greeting and a soft blue glow around the composer"],
    gaps: ["Google Sans and Gemini’s leading shield mark are not built-in assets", "The diffuse page-wide blue glow is approximated within the composer footer", "Menu options are local demonstrations, not Google integrations"],
  },
  {
    id: "copilot", name: "Copilot", source: "https://support.microsoft.com/en-us/microsoft-365-copilot/create-content-using-microsoft-365-copilot-chat",
    evidence: "Documentation-based Microsoft 365 Copilot approximation. Both live Copilot entry points required sign-in; current consumer geometry was not verified.",
    title: "How can I help you today?", placeholder: "Message Copilot", width: 760, radius: "24px",
    canvas: "#faf9f7", surface: "#ffffff", text: "#242424", muted: "#707070", border: "#deddda", layout: "stacked",
    matches: ["Message Copilot writing area, + menu, microphone, and arrow send", "Neutral card on a light canvas", "Web search represented as a selectable local mode"],
    gaps: ["Spacing, radius, and greeting are provisional, not measured from the current live app", "Microsoft 365 and consumer Copilot have different interfaces", "Sources, work context, and voice conversation require host integrations"],
  },
  {
    id: "perplexity", name: "Perplexity", source: "https://www.perplexity.ai/",
    evidence: "Live signed-in Search home: approximately 640px × 118px composer, 16px corners, Search / Computer, model, and voice.",
    title: "What do you want to know?", placeholder: "Ask anything…", width: 640, radius: "16px",
    canvas: "#fcfcf9", surface: "#ffffff", text: "#202221", muted: "#767874", border: "#dfdfda", layout: "stacked", model: "Model",
    matches: ["Left-aligned Search kicker and heading", "Compact rectangular composer with separate writing and toolbar rows", "Search / Computer choices, model picker, microphone, and voice-to-send swap"],
    gaps: ["Search is a toggle here; Perplexity’s control also opens a specialized menu", "Computer mode is local state and has no remote execution environment", "System fonts and generic search/computer icons approximate the branded assets"],
  },
];

/** Original geometric radial symbol; deliberately not the product logo. */
const radialSymbol = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="#c96945" stroke-width="3" stroke-linecap="round"><path d="M20 4v10m0 12v10M4 20h10m12 0h10M8.7 8.7l7 7m8.6 8.6l7 7M8.7 31.3l7-7m8.6-8.6l7-7M14 5l4 9m4 12l4 9M5 14l9 4m12 4l9 4M5 26l9-4m12-4l9-4M14 35l4-9m4-12l4-9"/></svg>')}`;

/** Original, generic assets registered through the public icon registry. */
export const assistantIcons = {
  "assistant-computer": [["rect", { x: "3", y: "4", width: "18", height: "13", rx: "2" }], ["path", { d: "M8 21h8M12 17v4" }]],
  "assistant-stop": [["rect", { x: "6", y: "6", width: "12", height: "12", rx: "2", fill: "currentColor", stroke: "none" }]],
} satisfies Parameters<typeof import("@runtypelabs/persona").registerIcons>[0];

/** Only public config, tokens, and action callbacks; no DOM overrides or custom renderers. */
export function createAssistantPreset(id: string, notice: (message: string) => void): AgentWidgetConfig {
  const p = assistantPresets.find(preset => preset.id === id) ?? assistantPresets[0];
  const dark = p.id === "chatgpt";
  const serif = p.id === "claude";
  const voice = p.id !== "gemini" && p.id !== "copilot";
  const perplexity = p.id === "perplexity";
  const gemini = p.id === "gemini";
  const font = p.id === "copilot" ? '"Segoe UI", system-ui, sans-serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const controlSize = dark ? "44px" : "32px";
  const glyphSize = gemini ? "24px" : perplexity ? "16px" : "20px";
  const rowGap = serif ? "18px" : "8px";
  const padding = serif ? "13px" : perplexity ? "12px" : gemini ? "11px 20px" : dark ? "3px 4px" : "14px";
  // Include the footer's top inset and the title's trailing space (20px, or
  // 8px with an inline icon) in the measured title-to-form gaps 48/36/40/28px.
  const greetingGap = dark ? "20px" : serif ? "20px" : gemini ? "4px" : perplexity ? "0px" : "20px";
  const modes = serif ? ["Chat", "Cowork"] : p.id === "perplexity" ? ["Search", "Computer"] : p.id === "copilot" ? ["Web search"] : [];
  return {
    future: { v5Defaults: true }, colorScheme: dark ? "dark" : "light", persistState: false,
    launcher: { enabled: false }, layout: { embedded: true, contentMaxWidth: `${p.width}px` },
    welcome: { variant: "hero", layout: "centered", anchor: "center", anchorComposerTop: "45%", composerGap: greetingGap, title: p.title, subtitle: "", align: p.id === "perplexity" ? "start" : "center", ...(serif ? { icon: { type: "image", url: radialSymbol, alt: "", placement: "inline" } } : {}), ...(p.id === "perplexity" ? { kicker: "Search" } : {}) },
    copy: { inputPlaceholder: p.placeholder },
    attachments: { enabled: true, maxFiles: 3 },
    voiceRecognition: { enabled: false },
    sendButton: { visibility: p.id === "copilot" ? "always" : "when-text", useIcon: true, iconName: "arrow-up", size: controlSize, iconSize: glyphSize, ...(gemini ? { stopIconName: "assistant-stop" } : { backgroundColor: dark ? "#eeeeee" : "#242424", textColor: dark ? "#171717" : "#ffffff" }) },
    composer: {
      layout: p.layout, placement: gemini ? "overlay" : "block", maxLines: 6,
      actionOverflow: { enabled: true, includeBuiltIns: ["attachments"], order: 0, collapseAutoActions: "fit" },
      modes: modes.map(label => ({ id: label.toLowerCase().replace(/ /g, "-"), groupId: "task", label, shortLabel: label, ...(perplexity ? { iconName: label === "Search" ? "search" : "assistant-computer", ...(label === "Search" ? { trailingIconName: "chevron-down" } : {}) } : {}), presentation: "bar" })),
      modeGroups: [{ id: "task", selection: "single", presentation: serif ? "segmented" : "buttons", chipVisibility: "hidden", label: "Task mode" }],
      defaultActiveModeIds: serif ? ["chat"] : p.id === "perplexity" ? ["search"] : [],
      ...(p.model ? { models: [{ id: "reference", label: p.model }, { id: "alternate", label: "Alternative", description: "Local demonstration only" }], selectedModelId: "reference", modelPicker: { presentation: "popover", ...(serif ? { suffix: "Medium" } : {}) }, onModelChange: () => notice("Model selection is local. This example has no model backend.") } : {}),
      actions: [
        { id: "tools", label: "Explore tools", iconName: "sparkles", placement: "start", presentation: "overflow", onSelect: () => notice("Tool menus can be populated with your own composer actions and integrations.") },
        { id: "dictate", label: "Dictate (demo)", iconName: "mic", placement: "end", presentation: "bar", order: 700, onSelect: () => notice("Dictation is a demo control. Enable voiceRecognition and a provider to capture speech.") },
        ...(voice ? [{ id: "voice", label: "Start voice (demo)", iconName: "voice-bars", iconAnimation: "voice" as const, placement: "end" as const, presentation: "bar" as const, order: 900, visibility: "when-empty" as const, iconColor: dark ? "#eeeeee" : serif ? p.text : "#ffffff", backgroundColor: dark ? "#363636" : serif ? "transparent" : "#242424", onSelect: () => notice("Voice bars animate during live transcription. This demo has no voice provider, so no microphone is being captured.") }] : []),
      ],
    },
    suggestions: { starters: { behavior: "fill", placement: serif ? "below-composer" : "auto", maxItems: 5, items: serif ? [{ label: "Write", icon: "pencil" }, { label: "Learn", icon: "file-text" }, { label: "Code", icon: "code-xml" }, { label: "Life stuff", icon: "message-square" }, { label: "Career chat", icon: "star" }] : [] } },
    messageActions: { enabled: true, visibility: "always" },
    theme: {
      semantic: { colors: { background: p.canvas, surface: p.surface, container: dark ? "#292929" : "#f0efeb", text: p.text, textMuted: p.muted, border: p.border, primary: p.text, accent: serif ? "#c96945" : p.text }, typography: { fontFamily: font } },
      components: {
        panel: { background: p.canvas },
        input: { background: p.surface, foreground: p.text, placeholder: p.muted, borderRadius: p.radius },
        button: { ghost: { background: "transparent", foreground: p.text, borderRadius: "9999px", hoverBackground: dark ? "#333333" : "#f0efed" }, ...(gemini ? { primary: { background: "#242424", foreground: "#ffffff" }, stop: { background: "#f0f0f0", foreground: "#000000" } } : {}) },
        composer: {
          footerPadding: gemini ? "16px 16px 24px" : "8px 16px 16px", footerBorder: "none",
          footerBackground: p.canvas,
          // The transparent upper edge lets messages fade behind the footer.
          // The blue glow starts below that edge and fades within the footer.
          ...(gemini ? { overlayBand: `radial-gradient(ellipse 50% 40% at 50% 60%, rgba(100,160,240,.18), rgba(100,160,240,.08) 60%, transparent 100%), linear-gradient(to bottom, transparent, ${p.canvas} 24px)` } : {}),
          padding, expandedPadding: padding,
          expandedBorderRadius: p.layout === "stacked" ? p.radius : "24px",
          borderColor: p.border, focusBorderColor: dark ? "#666666" : "#b7b7b1", focusRing: "none",
          fontSize: serif ? "15px" : dark || gemini ? "17px" : "16px", lineHeight: serif ? "21px" : "24px",
          controlSize, controlIconSize: glyphSize, gap: rowGap, controlGap: perplexity ? "8px" : serif ? "4px" : "8px",
          ...(perplexity ? { editorMinHeight: "52px", editorPadding: "2px 8px" } : {}), suggestionsGap: "40px",
          shadow: serif ? "0 4px 20px rgba(0,0,0,.075)" : perplexity ? "0 2px 8px rgba(0,0,0,.04)" : "none",
          modelPicker: { background: "transparent", labelColor: p.text, borderRadius: "12px", fontSize: gemini || perplexity ? "14px" : "13px", fontWeight: gemini ? "500" : "400", height: gemini ? "40px" : "32px", ...(gemini || perplexity ? { minWidth: "83px" } : {}) },
          mode: { fontSize: "14px", height: "32px", paddingInline: "8px", gap: "8px", borderRadius: "9999px", activeBorderColor: perplexity ? p.border : "transparent", activeBackground: "transparent" },
          segmented: { trackBackground: "#f0efeb", activeBackground: "#ffffff", trackBorderRadius: "5px", gap: "0px", padding: "2px", itemPadding: "3px 10px", fontSize: "14px", lineHeight: "20px", fontWeight: "400", minHeight: "26px" },
        },
        ...(serif ? { suggestion: { chip: { fontSize: "14px", minHeight: "32px", padding: "4px 12px", gap: "6px", iconSize: "16px", borderRadius: "8px" } } } : {}),
        introCard: { background: "transparent", border: "none", shadow: "none", padding: "0", title: { fontFamily: serif ? "Georgia, serif" : font, fontSize: serif ? "38px" : gemini ? "36px" : "24px", fontWeight: serif ? "330" : gemini ? "320" : "400", lineHeight: dark ? "28px" : perplexity ? "32px" : "1.25", color: p.text }, inlineIconSize: "36px", inlineIconGap: "12px", kicker: { fontSize: "12px", fontWeight: "500", color: p.muted } },
        message: { background: p.canvas, user: { background: dark ? "#292929" : "#efeee9", text: p.text, borderRadius: "24px", padding: "12px 18px" }, assistant: { background: "transparent", text: p.text, borderWidth: "0px", shadow: "none", fontFamily: serif ? "Georgia, serif" : font } },
      },
    },
  };
}
