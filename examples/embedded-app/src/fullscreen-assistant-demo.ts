/**
 * Fullscreen assistant demo: split UI with dark chat + artifact pane,
 * document toolbar, pill composer, and file card component.
 */
import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  componentRegistry,
  mergeWithDefaults,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetInitHandle,
  type AgentWidgetPlugin,
  type ComponentRenderer
} from "@runtypelabs/persona";
import {
  createFullscreenAssistantScriptedStream,
  FULLSCREEN_ASSISTANT_DEMO_ARTIFACT_ID,
  FULLSCREEN_ASSISTANT_SPOTLIGHT_MARKDOWN
} from "./fullscreen-assistant-demo-sse";

/** Must match `initAgentWidget` mount element `id` (used for persona:* window events). */
const FULLSCREEN_ASSISTANT_DEMO_INSTANCE_ID = "fullscreen-assistant-demo-root";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL != null
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

const COLORS = {
  page: "#000000",
  chat: "#171717",
  artifact: "#212121",
  border: "#333333",
  text: "#E5E5E5",
  muted: "#8E8E8E",
  userBubble: "#2B2B2B",
  inlineCodeBg: "#3D2222",
  inlineCodeFg: "#D19A9A",
  link: "#60a5fa"
} as const;

// Inject hover styles once — inline styles can't express :hover, and idiomorph preserves
// HTML attributes (including class/style) but strips addEventListener bindings.
const fileCardStyleId = "fullscreen-assistant-file-card-styles";
if (!document.getElementById(fileCardStyleId)) {
  const style = document.createElement("style");
  style.id = fileCardStyleId;
  style.textContent = `
    [data-open-artifact] {
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    [data-open-artifact]:hover {
      background-color: ${COLORS.userBubble} !important;
      border-color: ${COLORS.muted} !important;
    }
    [data-download-artifact] {
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    [data-download-artifact]:hover {
      background-color: ${COLORS.userBubble} !important;
      border-color: ${COLORS.muted} !important;
    }
    .persona-attachment-previews {
      margin-bottom: 8px;
    }
    [data-persona-audio-bars-btn] {
      transition: opacity 0.15s ease;
    }
    [data-persona-audio-bars-btn]:hover {
      opacity: 0.7;
    }
    [data-persona-audio-bars-btn]:hover line {
      animation: persona-audio-bars-bounce 0.6s ease-in-out infinite alternate;
    }
    [data-persona-audio-bars-btn]:hover line:nth-child(1) { animation-delay: 0s; }
    [data-persona-audio-bars-btn]:hover line:nth-child(2) { animation-delay: 0.1s; }
    [data-persona-audio-bars-btn]:hover line:nth-child(3) { animation-delay: 0.2s; }
    [data-persona-audio-bars-btn]:hover line:nth-child(4) { animation-delay: 0.15s; }
    [data-persona-audio-bars-btn]:hover line:nth-child(5) { animation-delay: 0.05s; }
    @keyframes persona-audio-bars-bounce {
      0%   { transform: scaleY(1); }
      100% { transform: scaleY(0.5); }
    }
    [data-persona-audio-bars-btn] svg line {
      transform-origin: center;
    }
    [data-persona-model-menu] {
      position: absolute;
      bottom: 100%;
      right: 0;
      margin-bottom: 4px;
      min-width: 160px;
      border: 1px solid ${COLORS.border};
      background: ${COLORS.chat};
      border-radius: 8px;
      padding: 4px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: 100;
    }
    [data-persona-model-menu] button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: ${COLORS.text};
      font-size: 12px;
      cursor: pointer;
      text-align: left;
    }
    [data-persona-model-menu] button:hover {
      background: ${COLORS.userBubble};
    }
    [data-persona-model-menu] button[data-selected]::after {
      content: "\\2713";
      color: ${COLORS.link};
      margin-left: 8px;
    }

    /* ── Artifact document toolbar overrides ── */

    /* All toolbar icon buttons: transparent bg, no border, muted color */
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-doc-icon-btn {
      border: none !important;
      background: transparent !important;
      color: ${COLORS.muted} !important;
      padding: 6px !important;
      border-radius: 8px !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-doc-icon-btn:hover {
      background: ${COLORS.userBubble} !important;
      color: ${COLORS.text} !important;
    }

    /* View/Source toggle: zero gap on parent container */
    #fullscreen-assistant-demo-root :has(> .persona-artifact-view-btn) {
      gap: 0 !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-view-btn,
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-code-btn {
      border: 1px solid ${COLORS.border} !important;
      background: transparent !important;
      border-radius: 0 !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-view-btn {
      border-radius: 8px 0 0 8px !important;
      border-right: none !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-code-btn {
      border-radius: 0 8px 8px 0 !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-view-btn[aria-pressed="true"],
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-code-btn[aria-pressed="true"] {
      background: ${COLORS.userBubble} !important;
      color: ${COLORS.text} !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-view-btn:hover,
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-code-btn:hover {
      background: ${COLORS.userBubble} !important;
    }

    /* Copy button: pill with border */
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-doc-copy-btn {
      border: 1px solid ${COLORS.border} !important;
      background: transparent !important;
      color: ${COLORS.text} !important;
      padding: 4px 10px !important;
      border-radius: 8px !important;
      font-size: 12px !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-doc-copy-btn:hover {
      background: ${COLORS.userBubble} !important;
    }

    /* Copy + chevron connected group */
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-relative {
      display: inline-flex;
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-relative .persona-artifact-doc-copy-btn {
      border: none !important;
      border-radius: 8px 0 0 8px !important;
      border-right: 1px solid ${COLORS.border} !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-relative .persona-artifact-doc-copy-menu-chevron {
      border: none !important;
      border-radius: 0 8px 8px 0 !important;
      padding: 4px 6px !important;
    }

    /* Copy dropdown menu — high specificity to beat #persona-root selectors */
    #fullscreen-assistant-demo-root .persona-artifact-doc-copy-menu {
      background: ${COLORS.chat} !important;
      border: 1px solid ${COLORS.border} !important;
      border-radius: 10px !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5) !important;
      padding: 4px 0 !important;
      min-width: 180px !important;
      position: absolute !important;
      right: 0 !important;
      top: 100% !important;
      margin-top: 4px !important;
      z-index: 50 !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-doc-copy-menu button {
      color: ${COLORS.text} !important;
      background: transparent !important;
      font-size: 13px !important;
      padding: 8px 14px !important;
      white-space: nowrap !important;
      display: block !important;
      width: 100% !important;
      text-align: left !important;
      border: none !important;
      cursor: pointer !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-doc-copy-menu button:hover {
      background: ${COLORS.userBubble} !important;
    }

    /* Close button: same as other icon buttons, highlight only on hover */
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document .persona-artifact-doc-icon-btn[aria-label="Close"]:hover {
      background: ${COLORS.userBubble} !important;
    }

    /* Header title+chevron: pill hover effect */
    #fullscreen-assistant-demo-root .persona-border-b-persona-divider > .persona-flex:first-child {
      border-radius: 10px;
      padding: 6px 4px 6px 12px;
      margin: -6px 0 -6px -12px;
      transition: background-color 0.15s ease, border-color 0.15s ease;
      border: 1px solid transparent;
      cursor: pointer;
      flex: none !important;
      width: fit-content;
    }
    #fullscreen-assistant-demo-root .persona-border-b-persona-divider > .persona-flex:first-child:hover {
      background: ${COLORS.userBubble};
      border-color: ${COLORS.border};
    }
    #fullscreen-assistant-demo-root .persona-border-b-persona-divider > .persona-flex:first-child button {
      border-left: 1px solid transparent;
      padding-left: 8px;
      margin-left: 4px;
      transition: border-color 0.15s ease;
    }
    #fullscreen-assistant-demo-root .persona-border-b-persona-divider > .persona-flex:first-child:hover button {
      border-left-color: ${COLORS.border};
    }

    /* Chat header: no border, fade shadow */
    #fullscreen-assistant-demo-root .persona-border-b-persona-divider {
      border-bottom: none !important;
      box-shadow: 0 8px 16px 4px ${COLORS.chat} !important;
      position: relative;
      z-index: 2;
    }

    /* Header assistant menu dropdown */
    [data-persona-header-menu] {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 4px;
      min-width: 200px;
      background: ${COLORS.chat};
      border: 1px solid ${COLORS.border};
      border-radius: 12px;
      padding: 6px 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      z-index: 100;
    }
    [data-persona-header-menu] button {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 14px;
      border: none;
      background: transparent;
      color: ${COLORS.text};
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      white-space: nowrap;
    }
    [data-persona-header-menu] button:hover {
      background: ${COLORS.userBubble};
    }
    [data-persona-header-menu] button[data-destructive] {
      color: #ef4444;
    }
    [data-persona-header-menu] hr {
      border: none;
      border-top: 1px solid ${COLORS.border};
      margin: 4px 0;
    }

    /* Toolbar background matches artifact pane */
    #fullscreen-assistant-demo-root .persona-artifact-toolbar-document {
      background: ${COLORS.artifact} !important;
      border-bottom: none !important;
    }

    /* Artifact tab list: more padding, match pane background */
    #fullscreen-assistant-demo-root .persona-artifact-list {
      background: ${COLORS.artifact} !important;
      border-bottom-color: ${COLORS.border} !important;
      padding: 8px 12px 8px 12px !important;
    }

    /* Artifact tabs: dark theme styling */
    #fullscreen-assistant-demo-root .persona-artifact-tab {
      color: ${COLORS.muted} !important;
      background: transparent !important;
      border-color: transparent !important;
      padding: 6px 12px !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-tab:hover {
      color: ${COLORS.text} !important;
      background: ${COLORS.userBubble} !important;
    }
    #fullscreen-assistant-demo-root .persona-artifact-tab.persona-bg-persona-container {
      color: ${COLORS.text} !important;
      background: ${COLORS.userBubble} !important;
      border-color: ${COLORS.border} !important;
    }
  `;
  document.head.appendChild(style);
}

const FullscreenAssistantFileCard: ComponentRenderer = (props) => {
  const title = typeof props.title === "string" ? props.title : "Runtype assistant spotlight";
  const subtitle = typeof props.subtitle === "string" ? props.subtitle : "Document · MD";
  const artifactId =
    typeof props.artifactId === "string" ? props.artifactId : FULLSCREEN_ASSISTANT_DEMO_ARTIFACT_ID;

  // NOTE: Direct addEventListener on component elements is lost when idiomorph morphs
  // the message list (it serialises to innerHTML). All interaction is handled via event
  // delegation on the mount element — see listeners below.
  const root = document.createElement("div");
  root.className =
    "persona-flex persona-w-full persona-max-w-full persona-items-center persona-gap-3 persona-rounded-xl persona-px-4 persona-py-3";
  root.style.border = `1px solid ${COLORS.border}`;
  root.style.backgroundColor = COLORS.chat;
  root.tabIndex = 0;
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", `Open ${title} in document panel`);
  root.style.cursor = "pointer";
  root.setAttribute("data-open-artifact", artifactId);

  const iconBox = document.createElement("div");
  iconBox.className =
    "persona-flex persona-h-10 persona-w-10 persona-flex-shrink-0 persona-items-center persona-justify-center persona-rounded-lg";
  iconBox.style.border = `1px solid ${COLORS.border}`;
  iconBox.style.color = COLORS.muted;
  iconBox.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`;

  const meta = document.createElement("div");
  meta.className = "persona-min-w-0 persona-flex-1 persona-flex persona-flex-col persona-gap-0.5";

  const t = document.createElement("div");
  t.className = "persona-truncate persona-text-sm persona-font-medium";
  t.style.color = COLORS.text;
  t.textContent = title;

  const s = document.createElement("div");
  s.className = "persona-text-xs";
  s.style.color = COLORS.muted;
  s.textContent = subtitle;

  meta.append(t, s);

  const dl = document.createElement("button");
  dl.type = "button";
  dl.textContent = "Download";
  dl.title = "Download spotlight as Markdown";
  dl.className =
    "persona-flex-shrink-0 persona-rounded-md persona-px-3 persona-py-1.5 persona-text-xs persona-font-medium";
  dl.style.border = `1px solid ${COLORS.border}`;
  dl.style.color = COLORS.text;
  dl.style.backgroundColor = "transparent";
  dl.setAttribute("data-download-artifact", "true");

  root.append(iconBox, meta, dl);
  return root;
};

componentRegistry.register("FullscreenAssistantFileCard", FullscreenAssistantFileCard);
// Override the built-in artifact card with the demo's custom card (adds Download button, custom styling)
componentRegistry.register("PersonaArtifactCard", FullscreenAssistantFileCard);

const audioBarsSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="8" x2="4" y2="16"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="16" y1="6" x2="16" y2="18"/><line x1="20" y1="10" x2="20" y2="14"/></svg>';

const chevronSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const fullscreenAssistantComposerPlugin: AgentWidgetPlugin = {
  id: "fullscreen-assistant-composer",
  renderComposer: ({
    config,
    onSubmit,
    openAttachmentPicker,
    models,
    selectedModelId,
    onModelChange,
    onVoiceToggle
  }) => {
    const footer = document.createElement("div");
    footer.className = "persona-widget-footer persona-px-6 persona-py-4";
    footer.style.backgroundColor = COLORS.chat;
    footer.style.borderTop = `1px solid ${COLORS.border}`;

    const suggestions = document.createElement("div");
    suggestions.className = "persona-mb-3 persona-flex persona-flex-wrap persona-gap-2";

    const form = document.createElement("form");
    form.setAttribute("data-persona-composer-form", "");
    form.className = "persona-flex persona-w-full persona-flex-col";
    form.style.outline = "none";
    form.style.backgroundColor = COLORS.artifact;
    form.style.border = `1px solid ${COLORS.border}`;
    form.style.borderRadius = "14px";

    // ── Top: textarea ──
    const input = document.createElement("textarea");
    input.setAttribute("data-persona-composer-input", "");
    input.rows = 1;
    input.placeholder = config.copy?.inputPlaceholder ?? "Reply…";
    input.className =
      "persona-w-full persona-resize-none persona-border-none persona-bg-transparent persona-text-sm persona-outline-none persona-px-5";
    input.style.color = COLORS.text;
    input.style.minHeight = "22px";
    input.style.paddingTop = "16px";
    input.style.paddingBottom = "8px";

    // ── Bottom: action bar ──
    const actionsRow = document.createElement("div");
    actionsRow.className =
      "persona-flex persona-items-center persona-justify-between persona-px-4";
    actionsRow.style.paddingBottom = "14px";
    actionsRow.style.paddingTop = "4px";

    // Left: attach button
    const plus = document.createElement("button");
    plus.type = "button";
    plus.setAttribute("aria-label", "Attach");
    plus.setAttribute("data-persona-composer-disable-when-streaming", "");
    plus.className =
      "persona-flex persona-items-center persona-justify-center persona-text-lg persona-leading-none persona-bg-transparent persona-border-none persona-cursor-pointer";
    plus.style.padding = "4px";
    plus.style.color = COLORS.muted;
    plus.textContent = "+";
    plus.addEventListener("click", () => openAttachmentPicker());

    // Right: model selector + send
    const rightGroup = document.createElement("div");
    rightGroup.className = "persona-flex persona-items-center persona-gap-3";

    // Model selector with dropdown
    const modelContainer = document.createElement("div");
    modelContainer.style.position = "relative";

    const modelWrap = document.createElement("button");
    modelWrap.type = "button";
    modelWrap.setAttribute("data-persona-composer-disable-when-streaming", "");
    modelWrap.className =
      "persona-flex persona-items-center persona-gap-1 persona-bg-transparent persona-border-none persona-text-xs persona-cursor-pointer";
    modelWrap.style.color = COLORS.muted;
    const modelLabel = document.createElement("span");
    let selectedId = selectedModelId ?? models?.[0]?.id ?? "opus";
    let menuOpen = false;

    const syncModelLabel = () => {
      const m = models?.find((x) => x.id === selectedId);
      modelLabel.textContent = m?.label ?? "Model";
    };
    syncModelLabel();
    modelWrap.append(modelLabel);
    modelWrap.insertAdjacentHTML("beforeend", chevronSvg);

    const buildMenu = () => {
      const existing = modelContainer.querySelector("[data-persona-model-menu]");
      if (existing) { existing.remove(); menuOpen = false; return; }
      if (!models?.length) return;

      const menu = document.createElement("div");
      menu.setAttribute("data-persona-model-menu", "");
      for (const m of models) {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.textContent = m.label;
        if (m.id === selectedId) opt.setAttribute("data-selected", "");
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedId = m.id;
          onModelChange?.(selectedId);
          syncModelLabel();
          menu.remove();
          menuOpen = false;
        });
        menu.appendChild(opt);
      }
      modelContainer.appendChild(menu);
      menuOpen = true;

      const closeMenu = (e: MouseEvent) => {
        if (!modelContainer.contains(e.target as Node)) {
          menu.remove();
          menuOpen = false;
          document.removeEventListener("click", closeMenu);
        }
      };
      requestAnimationFrame(() => document.addEventListener("click", closeMenu));
    };

    modelWrap.addEventListener("click", (e) => {
      e.stopPropagation();
      buildMenu();
    });

    modelContainer.appendChild(modelWrap);

    const voiceBtn = document.createElement("button");
    voiceBtn.type = "button";
    voiceBtn.setAttribute("data-persona-composer-mic", "");
    voiceBtn.setAttribute("data-persona-audio-bars-btn", "");
    voiceBtn.setAttribute("aria-label", "Voice input");
    voiceBtn.className =
      "persona-flex persona-items-center persona-justify-center persona-bg-transparent persona-border-none persona-cursor-pointer";
    voiceBtn.style.padding = "4px";
    voiceBtn.style.color = COLORS.muted;
    voiceBtn.innerHTML = audioBarsSvg;

    rightGroup.append(modelContainer, voiceBtn);
    actionsRow.append(plus, rightGroup);

    const trySend = () => {
      const v = input.value.trim();
      if (v) onSubmit(v);
      input.value = "";
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      trySend();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        trySend();
      }
    });

    form.append(input, actionsRow);
    footer.append(suggestions, form);

    const status = document.createElement("div");
    status.setAttribute("data-persona-composer-status", "");
    status.className = "persona-mt-2 persona-text-center persona-text-xs";
    status.style.color = COLORS.muted;
    status.textContent =
      "Claude is AI and can make mistakes. Please double-check responses.";
    footer.append(status);

    return footer;
  }
};

const fullscreenAssistantDarkTokens = {
  semantic: {
    colors: {
      primary: COLORS.text,
      surface: COLORS.chat,
      container: COLORS.chat,
      background: COLORS.page,
      text: COLORS.text,
      textMuted: COLORS.muted,
      border: COLORS.border,
      divider: COLORS.border,
      accent: COLORS.link,
      secondary: COLORS.muted,
      textInverse: COLORS.text,
      interactive: {
        default: COLORS.link,
        hover: COLORS.link,
        focus: COLORS.link,
        active: COLORS.link,
        disabled: COLORS.muted
      },
      feedback: {
        success: "#22c55e",
        warning: "#eab308",
        error: "#ef4444",
        info: COLORS.muted
      }
    }
  },
  components: {
    panel: {
      border: "none",
      shadow: "none",
      borderRadius: "0"
    },
    header: {
      background: COLORS.chat,
      border: COLORS.border,
      borderRadius: "0",
      foreground: COLORS.text
    },
    input: {
      background: COLORS.chat,
      placeholder: COLORS.muted,
      borderRadius: "9999px",
      foreground: COLORS.text,
      border: COLORS.border,
      focus: { border: COLORS.border, ring: "transparent" }
    },
    message: {
      user: {
        background: COLORS.userBubble,
        text: COLORS.text,
        borderRadius: "14px"
      },
      assistant: {
        background: "transparent",
        text: COLORS.text,
        borderRadius: "0",
        border: "transparent",
        shadow: "none"
      }
    },
    markdown: {
      inlineCode: {
        background: COLORS.inlineCodeBg,
        foreground: COLORS.inlineCodeFg
      },
      link: {
        foreground: COLORS.link
      },
      prose: {
        fontFamily: 'Georgia, "Times New Roman", Times, serif'
      },
      heading: {
        h1: { fontSize: "1.375rem", fontWeight: "650" },
        h2: { fontSize: "1.125rem", fontWeight: "600" }
      }
    }
  }
} as unknown as NonNullable<AgentWidgetConfig["darkTheme"]>;

const demoCtl: { handle: AgentWidgetInitHandle | null } = { handle: null };

function toggleAssistantMenu() {
  const existing = document.querySelector("[data-persona-header-menu]");
  if (existing) { existing.remove(); return; }

  const chevronBtn = document.querySelector('[aria-label="Assistant options"]');
  if (!chevronBtn) return;
  const anchor = chevronBtn.closest(".persona-flex") as HTMLElement | null;
  if (!anchor) return;
  anchor.style.position = "relative";

  const menu = document.createElement("div");
  menu.setAttribute("data-persona-header-menu", "");

  const items: { icon: string; label: string; id: string; destructive?: boolean }[] = [
    { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', label: "Star", id: "star" },
    { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>', label: "Rename", id: "rename" },
    { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>', label: "Add to project", id: "add-to-project" },
    { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', label: "Delete", id: "delete", destructive: true }
  ];

  for (let i = 0; i < items.length; i++) {
    if (i === items.length - 1) menu.appendChild(document.createElement("hr"));
    const item = items[i];
    const opt = document.createElement("button");
    opt.type = "button";
    opt.innerHTML = item.icon;
    const span = document.createElement("span");
    span.textContent = item.label;
    opt.appendChild(span);
    if (item.destructive) opt.setAttribute("data-destructive", "");
    opt.addEventListener("click", () => { menu.remove(); });
    menu.appendChild(opt);
  }

  anchor.appendChild(menu);
  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  requestAnimationFrame(() => document.addEventListener("click", closeMenu));
}

const newFullscreenAssistantScriptStream = () => createFullscreenAssistantScriptedStream();

const config = mergeWithDefaults({
  apiUrl,
  agent: {
    name: "Chat Assistant",
    model: "claude-sonnet-4-5",
    systemPrompt: "You are a helpful assistant. Be friendly, concise, and helpful. If you don't know something, say so.",
    artifacts: { enabled: true, types: ["markdown", "component"] },
  },
  colorScheme: "dark",
  darkTheme: {
    ...DEFAULT_WIDGET_CONFIG.darkTheme,
    ...fullscreenAssistantDarkTokens,
    inputBackground: COLORS.chat,
    border: COLORS.border,
    divider: COLORS.border,
    messageBorder: COLORS.border,
    panelBorder: "none",
    panelShadow: "none",
    panelBorderRadius: "0",
    micIconColor: COLORS.muted,
    micBackgroundColor: "transparent",
    micBorderColor: "transparent"
  },
  launcher: { enabled: false, fullHeight: true },
  copy: {
    showWelcomeCard: false,
    inputPlaceholder: "Reply…"
  },
  voiceRecognition: { enabled: true },
  messageActions: {
    showCopy: false,
    showUpvote: false,
    showDownvote: false
  },
  statusIndicator: {
    visible: true,
    idleText: "This assistant is AI and can make mistakes. Please double-check responses.",
    connectedText: "This assistant is AI and can make mistakes. Please double-check responses.",
    connectingText: "Connecting…",
    errorText: "Connection error"
  },
  wrapComponentDirectiveInBubble: false,
  parserType: "json",
  composer: {
    models: [
      { id: "opus-4-6-extended", label: "Opus 4.6 Extended" },
      { id: "sonnet-4-6", label: "Sonnet 4.6" }
    ],
    selectedModelId: "opus-4-6-extended"
  },
  attachments: { enabled: true },
  plugins: [fullscreenAssistantComposerPlugin],
  layout: {
    header: {
      layout: "minimal",
      showCloseButton: false,
      trailingActions: [
        { id: "assistant-menu", icon: "chevron-down", ariaLabel: "Assistant options" }
      ],
      onAction: (actionId) => {
        if (actionId === "assistant-menu") toggleAssistantMenu();
      },
      onTitleClick: () => toggleAssistantMenu()
    },
    messages: {
      layout: "bubble",
      timestamp: { show: false },
      avatar: { show: false }
    },
    contentMaxWidth: "72ch"
  },
  features: {
    showReasoning: false,
    showToolCalls: false,
    artifacts: {
      enabled: true,
      layout: {
        splitGap: "0",
        paneWidth: "50%",
        paneMaxWidth: "min(50%, 100%)",
        paneMinWidth: "0",
        paneAppearance: "seamless",
        unifiedSplitChrome: true,
        unifiedSplitOuterRadius: "0",
        paneShadow: "none",
        paneBorderLeft: `1px solid ${COLORS.border}`,
        paneBackground: COLORS.artifact,
        panePadding: "24px",
        toolbarPreset: "document",
        expandLauncherPanelWhenOpen: false,
        documentToolbarShowCopyLabel: true,
        documentToolbarShowCopyChevron: true,
        documentToolbarIconColor: COLORS.muted,
        documentToolbarToggleActiveBackground: `${COLORS.chat}`,
        documentToolbarToggleActiveBorderColor: COLORS.border,
        documentToolbarCopyMenuItems: [
          { id: "download", label: "Download" },
          { id: "download-pdf", label: "Download as PDF" },
          { id: "publish", label: "Publish artifact" }
        ],
        onDocumentToolbarCopyMenuSelect: async (p) => {
          if (p.actionId === "primary") {
            const text = p.markdown || p.jsonPayload || "";
            await navigator.clipboard.writeText(text);
            return;
          }
          if (p.actionId === "markdown" || p.actionId === "md") {
            await navigator.clipboard.writeText(p.markdown);
          } else if (p.actionId === "json") {
            await navigator.clipboard.writeText(p.jsonPayload);
          }
        },
        onDocumentToolbarRefresh: async () => {
          const h = demoCtl.handle;
          if (!h) return;
          h.clearChat();
          await h.connectStream(newFullscreenAssistantScriptStream());
        }
      },
      onArtifactAction: (action) => {
        if (action.type === "download") {
          try {
            const blob = new Blob([FULLSCREEN_ASSISTANT_SPOTLIGHT_MARKDOWN], {
              type: "text/markdown;charset=utf-8"
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "runtype-fullscreen-assistant-spotlight.md";
            a.rel = "noopener";
            a.click();
            URL.revokeObjectURL(url);
          } catch {
            /* ignore */
          }
          return true;
        }
        if (action.type === "open") {
          window.dispatchEvent(
            new CustomEvent("persona:showArtifacts", {
              detail: { instanceId: FULLSCREEN_ASSISTANT_DEMO_INSTANCE_ID }
            })
          );
          window.dispatchEvent(
            new CustomEvent("persona:selectArtifact", {
              detail: { instanceId: FULLSCREEN_ASSISTANT_DEMO_INSTANCE_ID, id: action.artifactId }
            })
          );
          return true;
        }
      }
    }
  },
  initialMessages: []
}) as AgentWidgetConfig;

const mount = document.getElementById("fullscreen-assistant-demo-root");
if (!mount) {
  throw new Error("#fullscreen-assistant-demo-root missing");
}

const handle = initAgentWidget({
  target: mount,
  useShadowDom: false,
  config
});

demoCtl.handle = handle;
void handle.connectStream(newFullscreenAssistantScriptStream());
