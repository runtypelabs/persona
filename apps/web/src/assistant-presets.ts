import { createAssistantMenuPreset } from "./assistant-menu-presets";
import type { AgentWidgetConfig } from "@runtypelabs/persona";

type Preset = {
  id: string; name: string; source: string; evidence: string;
  title: string; placeholder: string; width: number; radius: string;
  canvas: string; surface: string; text: string; muted: string; border: string;
  layout: "stacked" | "single-row"; model?: string;
  matches: string[]; gaps: string[];
};

/** Observed October 14, 2026; Claude retains its October 7 reference. Variants are not universal product defaults. */
export const assistantPresets: Preset[] = [
  {
    id: "chatgpt", name: "ChatGPT", source: "https://chatgpt.com/",
    evidence: "Live signed-out interface, dark compact composer. Signed-in Work uses a different, stacked variant.",
    title: "Where should we begin?", placeholder: "Ask ChatGPT", width: 768, radius: "28px",
    canvas: "#000000", surface: "#212121", text: "#f3f3f3", muted: "#a5a5a5", border: "rgba(255,255,255,.15)", layout: "single-row",
    matches: ["Compact composer and neutral dark palette", "Leading + menu and voice-to-send swap", "Centered welcome that disappears after sending"],
    gaps: ["Original audio bars approximate the proprietary glyph; its smaller circle has no independent action-size token", "System typography follows the observed platform stack; no product sidebar or account controls", "The reference is the signed-out variant; signed-in tools and model selection differ"],
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
    evidence: "Live signed-in empty conversation: approximately 660px × 64px dark pill with + and dictation; no model picker in this observed variant.",
    title: "Where should we start?", placeholder: "Ask Gemini", width: 660, radius: "9999px",
    canvas: "#101114", surface: "#202122", text: "#e3e3e3", muted: "#b9bdc2", border: "transparent", layout: "single-row",
    matches: ["Dark single-row pill with + and a transparent microphone", "Send appears only when there is a draft", "36px centered greeting and a diffuse blue glow"],
    gaps: ["Google Sans and Gemini’s leading shield mark are not built-in assets", "The blue glow uses a theme gradient; its exact live page distribution is approximate", "Menu options are local demonstrations, not Google integrations"],
  },
  {
    id: "copilot", name: "Copilot", source: "https://copilot.com/chat",
    evidence: "Live personal Copilot in Chrome: 768px × 60px single-row dark composer, 32px corners, +, and send only with a draft. No microphone in the observed states.",
    title: "Hi, what can I help you with?", placeholder: "Message Copilot", width: 768, radius: "32px",
    canvas: "#242321", surface: "#242424", text: "#e3e3e3", muted: "#a3a3a3", border: "#484848", layout: "single-row",
    matches: ["Measured dark pill with a leading + and transparent send after typing", "28px greeting with the observed title-to-composer spacing", "Explore / Shop / Play starters below the composer"],
    gaps: ["Segoe Sans uses the available system fallback; proprietary assets are not bundled", "Starters fill local demo prompts; they do not open Copilot integrations or its prompt gallery", "The reference hides starters on a draft; Persona hides them after sending"],
  },
  {
    id: "perplexity", name: "Perplexity", source: "https://www.perplexity.ai/",
    evidence: "Live signed-in Search home: approximately 640px × 118px composer, 16px corners, Search / Computer, model, and voice.",
    title: "What do you want to know?", placeholder: "Ask anything…", width: 640, radius: "16px",
    canvas: "#171615", surface: "#1e1d1c", text: "#d6d5d4", muted: "#8f8d89", border: "rgba(214,213,212,.10)", layout: "stacked", model: "Model",
    matches: ["Left-aligned Search kicker and heading", "Compact rectangular composer with separate writing and toolbar rows", "Search / Computer choices, model picker, microphone, and voice-to-send swap"],
    gaps: ["Search is a toggle here; Perplexity’s control also opens a specialized menu", "Computer mode is local state and has no remote execution environment", "System fonts and generic icons approximate branded assets; mode glyphs share the 16px control token", "Toolbar gaps share one token; the reference’s mixed 0px and 8px group spacing is approximate"],
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
  const chatgpt = p.id === "chatgpt";
  const dark = p.id !== "claude";
  const copilot = p.id === "copilot";
  const serif = p.id === "claude";
  const voice = p.id !== "gemini" && p.id !== "copilot";
  const perplexity = p.id === "perplexity";
  const gemini = p.id === "gemini";
  const font = copilot ? '"Segoe Sans", "Segoe UI", system-ui, sans-serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  // Sub-40px send sizes stay explicit to preserve their coarse-pointer geometry.
  const controlSize = chatgpt ? "44px" : "32px";
  const glyphSize = gemini ? "24px" : perplexity ? "16px" : "20px";
  const rowGap = serif ? "18px" : "8px";
  const padding = serif ? "13px" : perplexity ? "12px" : gemini ? "15px 20px" : chatgpt ? "3px 4px" : copilot ? "6px 10px" : "14px";
  // Include the footer's top inset and the title's trailing space (20px, or
  // 8px with an inline icon) in the measured title-to-form gaps 48/36/40/28px.
  const greetingGap = chatgpt ? "20px" : serif ? "20px" : gemini ? "4px" : perplexity ? "0px" : "28.6px";
  const modes = serif ? ["Chat", "Cowork"] : p.id === "perplexity" ? ["Search", "Computer"] : [];
  const menuPreset = createAssistantMenuPreset(p.id, notice);
  return {
    plugins: menuPreset.plugins,
    future: { v5Defaults: true }, colorScheme: dark ? "dark" : "light", persistState: false,
    launcher: { enabled: false }, layout: { embedded: true, contentMaxWidth: `${p.width}px` },
    welcome: { variant: "hero", layout: "centered", anchor: "center", anchorComposerTop: "45%", composerGap: greetingGap, title: p.title, subtitle: "", align: p.id === "perplexity" ? "start" : "center", ...(serif ? { icon: { type: "image", url: radialSymbol, alt: "", placement: "inline" } } : {}), ...(p.id === "perplexity" ? { kicker: "Search" } : {}) },
    copy: { inputPlaceholder: p.placeholder },
    attachments: { enabled: true, maxFiles: 3, preview: {
      image: {
        layout: perplexity ? "chip" : "thumbnail", name: perplexity ? "full" : "hidden",
        fit: serif || gemini || chatgpt ? "contain" : "cover",
        remove: { placement: perplexity ? "inline" : chatgpt ? "overlap" : "inside", visibility: copilot ? "always" : "hover" },
      },
      file: {
        layout: perplexity || copilot ? "horizontal" : "vertical", icon: !serif,
        ...(gemini ? { iconName: "code-xml" } : {}), iconPlacement: chatgpt ? "center" : "start",
        name: gemini ? "basename" : "full", metadata: serif ? "line-count" : "none", badge: serif ? "extension" : "none",
        remove: { placement: perplexity ? "inline" : chatgpt ? "overlap" : "inside", visibility: copilot ? "always" : "hover" },
      },
    } },
    voiceRecognition: { enabled: false, ...(copilot ? { showButton: false } : {}), ...(serif ? { tooltipText: "Dictate", showTooltip: true } : {}) },
    sendButton: { visibility: "when-text", useIcon: true, iconName: "arrow-up", ...(!chatgpt ? { size: controlSize } : {}), ...(gemini ? { stopIconName: "assistant-stop" } : {}) },
    composer: {
      layout: p.layout, attachmentLayout: copilot ? "single-row" : "stacked", placement: gemini ? "overlay" : "block", maxLines: 6,
      actionOverflow: { enabled: true, includeBuiltIns: ["attachments"], order: 0, collapseAutoActions: "fit", menu: menuPreset.menu },
      modes: [...menuPreset.modes, ...modes.map(label => ({ id: label.toLowerCase().replace(/ /g, "-"), groupId: "task", label, shortLabel: label, ...(perplexity ? { iconName: label === "Search" ? "search" : "assistant-computer", ...(label === "Search" ? { trailingIconName: "chevron-down" } : {}) } : {}), presentation: "bar" as const })),],
      modeGroups: [...menuPreset.modeGroups, { id: "task", selection: "single", presentation: serif ? "segmented" : "buttons", chipVisibility: "hidden", label: "Task mode" }],
      defaultActiveModeIds: serif ? ["chat"] : p.id === "perplexity" ? ["search"] : [],
      ...(p.model ? { models: [{ id: "reference", label: p.model }, { id: "alternate", label: "Alternative", description: "Local demonstration only" }], selectedModelId: "reference", modelPicker: { presentation: "popover", ...(serif ? { suffix: "Medium" } : {}) }, onModelChange: () => notice("Model selection is local. This example has no model backend.") } : {}),
      actions: [
        ...menuPreset.actions,
        ...(!copilot ? [{ id: "dictate", label: "Dictate (demo)", iconName: "mic", placement: "end" as const, presentation: "bar" as const, order: 700, onSelect: () => notice("Dictation is a demo control. Enable voiceRecognition and a provider to capture speech.") }] : []),
        ...(voice ? [{ id: "voice", label: "Start voice (demo)", iconName: "voice-bars", iconAnimation: "voice" as const, placement: "end" as const, presentation: "bar" as const, order: 900, visibility: "when-empty" as const, iconColor: chatgpt ? "#eeeeee" : serif ? p.text : "#1e1d1c", backgroundColor: chatgpt ? "#363636" : serif ? "transparent" : "#d6d5d4", onSelect: () => notice("Voice bars animate during live transcription. This demo has no voice provider, so no microphone is being captured.") }] : []),
      ],
    },
    suggestions: { starters: { behavior: "fill", placement: serif || copilot ? "below-composer" : "auto", maxItems: 5, items: serif ? [{ label: "Write", icon: "pencil" }, { label: "Learn", icon: "file-text" }, { label: "Code", icon: "code-xml" }, { label: "Life stuff", icon: "message-square" }, { label: "Career chat", icon: "star" }] : copilot ? [{ label: "Explore", prompt: "Help me explore a new topic." }, { label: "Shop", prompt: "Help me compare options for a purchase." }, { label: "Play", prompt: "Suggest a word game to play." }] : [] } },
    messageActions: { enabled: true, visibility: "always" },
    theme: {
      semantic: { colors: { background: p.canvas, surface: p.surface, container: dark ? "#292929" : "#f0efeb", text: p.text, textMuted: p.muted, border: p.border, primary: p.text, accent: serif ? "#c96945" : p.text }, typography: { fontFamily: font } },
      components: {
        attachment: { composer: {
          gap: "12px",
          image: {
            width: serif ? "124px" : chatgpt ? "120px" : gemini ? "112px" : copilot ? "48px" : "20px",
            height: serif ? "124px" : chatgpt ? "120px" : gemini ? "112px" : copilot ? "48px" : "20px",
            borderRadius: perplexity ? "4px" : gemini ? "20px" : "12px",
            ...(serif ? { background: "semantic.colors.surface" } : {}),
            ...(perplexity ? { chip: { background: "transparent", borderColor: p.border, borderRadius: "8px", padding: "4px 8px", gap: "8px", fontSize: "14px", minHeight: "30px", width: "auto" } } : {}),
            ...(copilot ? { remove: { background: "#6b6b6b", foreground: "#ffffff" } } : {}),
          },
          file: {
            width: serif ? "124px" : chatgpt ? "160px" : gemini ? "112px" : copilot ? "188px" : "auto",
            minHeight: serif ? "124px" : chatgpt ? "120px" : gemini ? "112px" : copilot ? "50px" : "30px",
            fontSize: perplexity ? "14px" : "12px", borderRadius: gemini ? "20px" : serif || chatgpt || copilot ? "12px" : "8px",
            ...(serif ? { background: "semantic.colors.surface" } : {}),
            ...(chatgpt ? { background: "#000000", iconSize: "32px", iconForeground: "#c4c4c4" } : {}),
            ...(gemini ? { background: "#383a3a", iconSize: "28px", iconForeground: "#ffffff", iconBackground: "#b9312b" } : {}),
            ...(copilot ? { iconSize: "28px", padding: "10px 32px 10px 10px", remove: { background: "transparent", foreground: p.muted, hoverBackground: "#555555", hoverForeground: "#ffffff" } } : {}),
            ...(perplexity ? { background: "transparent", borderColor: p.border, padding: "4px 8px", gap: "8px", iconSize: "18px" } : {}),
          },
          remove: chatgpt ? { background: "#eeeeee", foreground: "#242424", borderColor: "#000000", borderWidth: "3px", size: "24px", iconSize: "12px", inset: "6px" } :
            gemini ? { background: "#ffffff", foreground: "#202122", size: "24px", iconSize: "14px", inset: "6px" } :
            perplexity ? { background: "transparent", foreground: p.muted, size: "16px", iconSize: "12px" } :
            copilot ? { size: "20px", iconSize: "12px", inset: "6px" } : {},
        } },
        panel: { background: gemini ? `radial-gradient(ellipse 65% 45% at 50% 55%, #202c65 0%, #141a35 50%, ${p.canvas} 100%)` : p.canvas },
        input: { background: p.surface, foreground: p.text, placeholder: p.muted, borderRadius: p.radius },
        button: { ghost: { background: "transparent", foreground: p.text, borderRadius: "9999px", hoverBackground: dark ? "#333333" : "#f0efed" }, ...(gemini ? { primary: { background: "#e3e3e3", foreground: "#202122" }, stop: { background: "#e3e3e3", foreground: "#202122" } } : {}) },
        voice: { control: { background: "transparent", foreground: perplexity ? p.muted : p.text, borderRadius: serif ? "8px" : "9999px", borderWidth: "0" } },
        composer: {
          overflowMenu: menuPreset.theme,
          send: { ...(chatgpt ? { size: controlSize } : {}), iconSize: copilot ? "16px" : glyphSize, ...(!gemini ? { background: copilot ? "transparent" : dark ? "#eeeeee" : "#242424", foreground: copilot ? p.text : dark ? "#171717" : "#ffffff" } : {}) },
          footerPadding: gemini ? "16px 16px 24px" : "8px 16px 16px", footerBorder: "none",
          footerBackground: gemini ? "transparent" : p.canvas,
          ...(gemini ? { overlayBand: "transparent" } : {}),
          padding, expandedPadding: p.layout === "single-row" ? "12px 16px" : padding,
          expandedBorderRadius: p.layout === "stacked" ? p.radius : "24px",
          borderColor: p.border, focusBorderColor: dark ? "#666666" : "#b7b7b1", focusRing: "none",
          fontSize: serif ? "15px" : chatgpt || gemini ? "17px" : "16px", lineHeight: serif ? "21px" : copilot ? "27.2px" : "24px",
          controlSize, controlIconSize: glyphSize, gap: rowGap, controlGap: perplexity ? "8px" : serif ? "4px" : "8px",
          ...(perplexity ? { editorMinHeight: "52px", editorPadding: "2px 8px" } : copilot ? { editorMinHeight: "46px", editorPadding: "9.4px 2px" } : {}), suggestionsGap: copilot ? "32px" : "40px",
          shadow: serif ? "0 4px 20px rgba(0,0,0,.075)" : perplexity ? "0 2px 8px rgba(0,0,0,.04)" : "none",
          modelPicker: { background: "transparent", labelColor: p.text, borderRadius: "12px", fontSize: gemini || perplexity ? "14px" : "13px", fontWeight: gemini ? "500" : "400", height: gemini ? "40px" : "32px", ...(gemini || perplexity ? { minWidth: "83px" } : {}) },
          mode: { fontSize: "14px", height: "32px", paddingInline: "8px", gap: "8px", borderRadius: "9999px", activeBorderColor: perplexity ? p.border : "transparent", activeBackground: "transparent" },
          segmented: { trackBackground: "#f0efeb", activeBackground: "#ffffff", trackBorderRadius: "5px", gap: "0px", padding: "2px", itemPadding: "3px 10px", fontSize: "14px", lineHeight: "20px", fontWeight: "400", minHeight: "26px" },
        },
        ...(serif || copilot ? { suggestion: { chip: { fontSize: "14px", minHeight: copilot ? "40px" : "32px", padding: copilot ? "8px 12px" : "4px 12px", gap: "6px", iconSize: "16px", borderRadius: copilot ? "12px" : "8px", ...(copilot ? { background: "transparent", foreground: p.text, border: p.border } : {}) } } } : {}),
        introCard: { background: "transparent", border: "none", shadow: "none", padding: "0", title: { fontFamily: serif ? "Georgia, serif" : font, fontSize: serif ? "38px" : gemini ? "36px" : copilot ? "28px" : "24px", fontWeight: serif ? "330" : gemini ? "320" : "400", lineHeight: chatgpt ? "28px" : gemini ? "44px" : copilot ? "33.6px" : perplexity ? "32px" : "1.25", color: p.text }, inlineIconSize: "36px", inlineIconGap: "12px", kicker: { fontSize: "12px", fontWeight: "500", color: p.muted } },
        message: { background: gemini ? "transparent" : p.canvas, user: { background: dark ? "#292929" : "#efeee9", text: p.text, borderRadius: "24px", padding: "12px 18px" }, assistant: { background: "transparent", text: p.text, borderWidth: "0px", shadow: "none", fontFamily: serif ? "Georgia, serif" : font } },
      },
    },
  };
}
