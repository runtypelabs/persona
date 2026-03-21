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

const micSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

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
    onModelChange
  }) => {
    const footer = document.createElement("div");
    footer.className =
      "persona-widget-footer persona-border-t persona-border-persona-divider persona-bg-persona-surface persona-px-6 persona-py-4";

    const suggestions = document.createElement("div");
    suggestions.className = "persona-mb-3 persona-flex persona-flex-wrap persona-gap-2";

    const form = document.createElement("form");
    form.setAttribute("data-persona-composer-form", "");
    form.className =
      "persona-flex persona-w-full persona-items-center persona-gap-3 persona-rounded-full persona-border persona-border-persona-border persona-bg-persona-input-background persona-px-4 persona-py-2";
    form.style.outline = "none";
    form.style.minHeight = "48px";

    const plus = document.createElement("button");
    plus.type = "button";
    plus.setAttribute("aria-label", "Attach");
    plus.setAttribute("data-persona-composer-disable-when-streaming", "");
    plus.className =
      "persona-flex persona-h-8 persona-w-8 persona-flex-shrink-0 persona-items-center persona-justify-center persona-rounded-full persona-text-lg persona-leading-none persona-text-persona-muted";
    plus.style.border = `1px solid ${COLORS.border}`;
    plus.style.backgroundColor = "transparent";
    plus.textContent = "+";
    plus.addEventListener("click", () => openAttachmentPicker());

    const input = document.createElement("textarea");
    input.setAttribute("data-persona-composer-input", "");
    input.rows = 1;
    input.placeholder = config.copy?.inputPlaceholder ?? "Reply…";
    input.className =
      "persona-min-h-[22px] persona-flex-1 persona-resize-none persona-border-none persona-bg-transparent persona-text-sm persona-text-persona-primary persona-outline-none";

    const modelWrap = document.createElement("button");
    modelWrap.type = "button";
    modelWrap.setAttribute("data-persona-composer-disable-when-streaming", "");
    modelWrap.className =
      "persona-flex persona-flex-shrink-0 persona-items-center persona-gap-1 persona-rounded-md persona-border persona-border-persona-border persona-bg-transparent persona-px-2 persona-py-1 persona-text-xs";
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
    modelWrap.addEventListener("click", () => {
      if (!models?.length) return;
      const idx = Math.max(
        0,
        models.findIndex((x) => x.id === selectedId)
      );
      const next = models[(idx + 1) % models.length];
      selectedId = next.id;
      onModelChange?.(selectedId);
      syncModelLabel();
    });

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.setAttribute("data-persona-composer-submit", "");
    submit.setAttribute("aria-label", "Send");
    submit.className =
      "persona-flex persona-h-9 persona-w-9 persona-flex-shrink-0 persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted";
    submit.style.border = "none";
    submit.style.backgroundColor = "transparent";
    submit.innerHTML = micSvg;

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

    form.append(plus, input, modelWrap, submit);
    footer.append(suggestions, form);

    const status = document.createElement("div");
    status.setAttribute("data-persona-composer-status", "");
    status.className = "persona-mt-2 persona-text-center persona-text-xs persona-text-persona-muted";
    status.textContent =
      "Claude is AI and can make mistakes. Please double-check responses.";
    footer.append(status);

    return footer;
  }
};

const fullscreenAssistantDarkTokens = {
  semantic: {
    colors: {
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
      borderRadius: "14px"
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

const newFullscreenAssistantScriptStream = () => createFullscreenAssistantScriptedStream();

const config = mergeWithDefaults({
  apiUrl,
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
    panelBorderRadius: "14px",
    micIconColor: COLORS.muted,
    micBackgroundColor: "transparent",
    micBorderColor: "transparent"
  },
  launcher: { enabled: false, fullHeight: true },
  copy: {
    showWelcomeCard: false,
    inputPlaceholder: "Reply…"
  },
  voiceRecognition: { enabled: false },
  messageActions: {
    showCopy: false,
    showUpvote: false,
    showDownvote: false
  },
  statusIndicator: { visible: false },
  wrapComponentDirectiveInBubble: false,
  parserType: "json",
  plugins: [fullscreenAssistantComposerPlugin],
  layout: {
    header: {
      layout: "minimal",
      showCloseButton: false,
      trailingActions: [
        { id: "assistant-menu", icon: "chevron-down", ariaLabel: "Assistant options" }
      ],
      onAction: (actionId) => {
        if (import.meta.env.DEV && typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.debug("[fullscreen-assistant-demo] header action:", actionId);
        }
      }
    },
    messages: {
      layout: "bubble",
      timestamp: { show: false },
      avatar: { show: false }
    }
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
        unifiedSplitOuterRadius: "14px",
        paneShadow: "none",
        paneBorderLeft: `1px solid ${COLORS.border}`,
        paneBackground: COLORS.artifact,
        panePadding: "24px",
        toolbarPreset: "document",
        expandLauncherPanelWhenOpen: false,
        documentToolbarShowCopyLabel: true,
        documentToolbarShowCopyChevron: true,
        documentToolbarIconColor: COLORS.link,
        documentToolbarToggleActiveBackground: `${COLORS.chat}`,
        documentToolbarToggleActiveBorderColor: COLORS.border,
        documentToolbarCopyMenuItems: [
          { id: "markdown", label: "Copy markdown" },
          { id: "json", label: "Copy as JSON" }
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

// ── File card event delegation ──────────────────────────────────────────────
// Component elements lose addEventListener bindings when idiomorph morphs the
// message list (it serialises to innerHTML). We attach delegation handlers on
// the stable mount element instead — these survive any number of morphs.
mount.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  // Download button — must check first so we can stop the card handler from firing.
  const dlBtn = target.closest("[data-download-artifact]") as HTMLElement | null;
  if (dlBtn) {
    e.stopPropagation();
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
    return;
  }

  // Card body → open / focus the artifact in the document pane.
  const card = target.closest("[data-open-artifact]") as HTMLElement | null;
  if (card) {
    const id = card.getAttribute("data-open-artifact");
    if (id) {
      window.dispatchEvent(
        new CustomEvent("persona:showArtifacts", {
          detail: { instanceId: FULLSCREEN_ASSISTANT_DEMO_INSTANCE_ID }
        })
      );
      window.dispatchEvent(
        new CustomEvent("persona:selectArtifact", {
          detail: { instanceId: FULLSCREEN_ASSISTANT_DEMO_INSTANCE_ID, id }
        })
      );
    }
  }
});

mount.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = (e.target as HTMLElement).closest("[data-open-artifact]") as HTMLElement | null;
  if (!card) return;
  e.preventDefault();
  card.click();
});

demoCtl.handle = handle;
void handle.connectStream(newFullscreenAssistantScriptStream());
