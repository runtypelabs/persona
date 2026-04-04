/**
 * Fullscreen assistant demo: split UI with dark chat + artifact pane,
 * document toolbar, pill composer, and file card component.
 */
import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  createDropdownMenu,
  createIconButton,
  createLabelButton,
  createLocalStorageAdapter,
  mergeWithDefaults,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetInitHandle,
  type AgentWidgetPlugin
} from "@runtypelabs/persona";
import {
  createFullscreenAssistantScriptedStream,
  FULLSCREEN_ASSISTANT_DEMO_ARTIFACT_ID,
  FULLSCREEN_ASSISTANT_SPOTLIGHT_MARKDOWN
} from "./fullscreen-assistant-demo-sse";

/** Must match `initAgentWidget` mount element `id` (used for persona:* window events). */
const FULLSCREEN_ASSISTANT_DEMO_INSTANCE_ID = "fullscreen-assistant-demo-root";

/** Isolated from the main embedded-app `persona-state` bucket (home + shared demos). */
const FULLSCREEN_ASSISTANT_DEMO_STORAGE_KEY = "persona-fullscreen-assistant-demo";
const fullscreenAssistantWidgetStorage = createLocalStorageAdapter(
  FULLSCREEN_ASSISTANT_DEMO_STORAGE_KEY
);

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

// Inject hover styles that can't be expressed via inline styles or SDK tokens.
// After SDK token additions, only file card hover, attachment preview, and audio bars remain.
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
  `;
  document.head.appendChild(style);
}

function renderCustomFileCard(artifactId: string, title: string, subtitle: string): HTMLElement {
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

  const dl = createLabelButton({
    icon: "download",
    label: "Download",
    variant: "ghost",
    size: "sm",
    className: "persona-flex-shrink-0",
  });
  dl.style.border = `1px solid ${COLORS.border}`;
  dl.style.color = COLORS.text;
  dl.setAttribute("data-download-artifact", "true");

  root.append(iconBox, meta, dl);
  return root;
}

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
    const plus = createIconButton({
      icon: "plus",
      label: "Attach",
      size: 18,
      strokeWidth: 1.5,
      className: "persona-border-none persona-bg-transparent",
      onClick: () => openAttachmentPicker(),
    });
    plus.setAttribute("data-persona-composer-disable-when-streaming", "");
    plus.style.color = COLORS.muted;

    // Right: model selector + send
    const rightGroup = document.createElement("div");
    rightGroup.className = "persona-flex persona-items-center persona-gap-3";

    // Model selector with dropdown (using SDK dropdown utility)
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

    const syncModelLabel = () => {
      const m = models?.find((x) => x.id === selectedId);
      modelLabel.textContent = m?.label ?? "Model";
    };
    syncModelLabel();
    modelWrap.append(modelLabel);
    modelWrap.insertAdjacentHTML("beforeend", chevronSvg);

    const modelDropdown = models?.length
      ? createDropdownMenu({
          items: models.map((m) => ({ id: m.id, label: m.label })),
          onSelect: (id) => {
            selectedId = id;
            onModelChange?.(selectedId);
            syncModelLabel();
          },
          anchor: modelContainer,
          position: "bottom-right",
        })
      : null;

    if (modelDropdown) {
      // Position above the button instead of below
      modelDropdown.element.style.bottom = "100%";
      modelDropdown.element.style.top = "auto";
      modelDropdown.element.style.marginBottom = "4px";
      modelDropdown.element.style.marginTop = "0";
      modelContainer.appendChild(modelDropdown.element);
    }

    modelWrap.addEventListener("click", (e) => {
      e.stopPropagation();
      modelDropdown?.toggle();
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
      foreground: COLORS.text,
      shadow: `0 8px 16px 4px ${COLORS.chat}`,
      borderBottom: "none",
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
    },
    scrollToBottom: {
      background: "#171717",
      foreground: "#FFFFFF",
      border: "rgba(72, 71  , 69, 1)",
      size: "44px",
      borderRadius: "9999px",
      shadow: "0 4px 16px rgba(0, 0, 0, 0.45)",
      iconSize: "18px",
      gap: "0",
      padding: "0",
      fontSize: "0.75rem",
    },
    artifact: {
      toolbar: {
        iconBackground: "transparent",
        iconBorder: "none",
        iconPadding: "6px",
        iconBorderRadius: "8px",
        iconHoverBackground: COLORS.userBubble,
        iconHoverColor: COLORS.text,
        toggleGroupGap: "0",
        toggleBorderRadius: "0",
        copyBackground: "transparent",
        copyBorder: `1px solid ${COLORS.border}`,
        copyColor: COLORS.text,
        copyBorderRadius: "8px",
        copyPadding: "4px 10px",
        copyMenuBackground: COLORS.chat,
        copyMenuBorder: `1px solid ${COLORS.border}`,
        copyMenuShadow: "0 4px 16px rgba(0,0,0,0.5)",
        copyMenuBorderRadius: "10px",
        copyMenuItemHoverBackground: COLORS.userBubble,
        toolbarBorder: "none",
      },
      tab: {
        textColor: COLORS.muted,
        background: "transparent",
        activeBackground: COLORS.userBubble,
        activeBorder: COLORS.border,
        hoverBackground: COLORS.userBubble,
        listBackground: COLORS.artifact,
        listBorderColor: COLORS.border,
        listPadding: "8px 12px",
      },
      pane: {
        toolbarBackground: COLORS.artifact,
      },
    },
  }
} as unknown as NonNullable<AgentWidgetConfig["darkTheme"]>;

const demoCtl: { handle: AgentWidgetInitHandle | null } = { handle: null };
let isStarred = false;

const newFullscreenAssistantScriptStream = () => createFullscreenAssistantScriptedStream();

const config = mergeWithDefaults({
  apiUrl,
  storageAdapter: fullscreenAssistantWidgetStorage,
  persistState: {
    keyPrefix: `${FULLSCREEN_ASSISTANT_DEMO_STORAGE_KEY}-`
  },
  agent: {
    name: "Chat Assistant",
    model: "mercury-2",
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
      titleMenu: {
        menuItems: [
          { id: "star", label: "Star", icon: "star" },
          { id: "rename", label: "Rename", icon: "pencil" },
          { id: "add-to-project", label: "Add to project", icon: "folder" },
          { id: "delete", label: "Delete", icon: "trash-2", destructive: true, dividerBefore: true },
        ],
        onSelect: (id) => {
          const h = demoCtl.handle;
          if (!h) return;
          switch (id) {
            case "star": {
              isStarred = !isStarred;
              // Update the combo button label directly (no config side effects)
              const label = document.querySelector(".persona-combo-btn-label");
              if (label) {
                label.textContent = isStarred ? "\u2605 Chat Assistant" : "Chat Assistant";
              }
              break;
            }
            case "rename": {
              const label = document.querySelector(".persona-combo-btn-label");
              const current = label?.textContent?.replace(/^\u2605\s*/, "") ?? "Chat Assistant";
              const newName = window.prompt("Rename chat:", current);
              if (newName?.trim() && label) {
                const prefix = isStarred ? "\u2605 " : "";
                label.textContent = prefix + newName.trim();
              }
              break;
            }
            case "add-to-project":
              console.log("[titleMenu] Add to project");
              break;
            case "delete":
              if (window.confirm("Delete this chat? This cannot be undone.")) {
                h.clearChat();
              }
              break;
          }
        },
        hover: {
          background: COLORS.userBubble,
          border: COLORS.border,
        },
      }
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
    scrollToBottom: {
      enabled: true,
      iconName: "arrow-down",
      label: "",
    },
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
      renderCard: ({ artifact }) => {
        return renderCustomFileCard(
          artifact.artifactId,
          artifact.title || "Runtype assistant spotlight",
          `${artifact.artifactType === "component" ? "Component" : "Document"} · ${artifact.artifactType.toUpperCase()}`
        );
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
