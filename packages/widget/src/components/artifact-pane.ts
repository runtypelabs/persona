import { createElement } from "../utils/dom";
import type { AgentWidgetConfig, AgentWidgetMessage, PersonaArtifactRecord } from "../types";
import { escapeHtml, createMarkdownProcessorFromConfig } from "../postprocessors";
import { resolveSanitizer } from "../utils/sanitize";
import { componentRegistry, type ComponentContext } from "./registry";
import { renderLucideIcon } from "../utils/icons";
import { createDropdownMenu, type DropdownMenuHandle } from "../utils/dropdown";
import { createIconButton, createLabelButton } from "../utils/buttons";

export type ArtifactPaneApi = {
  element: HTMLElement;
  /** Backdrop for mobile drawer (optional separate layer) */
  backdrop: HTMLElement | null;
  update: (state: { artifacts: PersonaArtifactRecord[]; selectedId: string | null }) => void;
  setMobileOpen: (open: boolean) => void;
};

function fallbackComponentCard(sel: PersonaArtifactRecord): HTMLElement {
  const card = createElement(
    "div",
    "persona-rounded-lg persona-border persona-border-persona-border persona-p-3 persona-text-persona-primary"
  );
  const title = createElement("div", "persona-font-semibold persona-text-sm persona-mb-2");
  title.textContent = sel.component ? `Component: ${sel.component}` : "Component";
  const pre = createElement("pre", "persona-font-mono persona-text-xs persona-whitespace-pre-wrap persona-overflow-x-auto");
  pre.textContent = JSON.stringify(sel.props ?? {}, null, 2);
  card.appendChild(title);
  card.appendChild(pre);
  return card;
}

/**
 * Right-hand artifact sidebar / mobile drawer content.
 */
export function createArtifactPane(
  config: AgentWidgetConfig,
  options: {
    onSelect: (id: string) => void;
    /** User closed the pane (mobile drawer or split sidebar) — parent should persist “hidden until reopened”. */
    onDismiss?: () => void;
  }
): ArtifactPaneApi {
  const layout = config.features?.artifacts?.layout;
  const toolbarPreset = layout?.toolbarPreset ?? "default";
  const documentChrome = toolbarPreset === "document";
  const panePadding = layout?.panePadding?.trim();

  const md = config.markdown ? createMarkdownProcessorFromConfig(config.markdown) : null;
  const sanitize = resolveSanitizer(config.sanitize);
  const toHtml = (text: string) => {
    const raw = md ? md(text) : escapeHtml(text);
    return sanitize ? sanitize(raw) : raw;
  };

  const backdrop =
    typeof document !== "undefined"
      ? createElement(
          "div",
          "persona-artifact-backdrop persona-fixed persona-inset-0 persona-z-[55] persona-bg-black/30 persona-hidden md:persona-hidden"
        )
      : null;
  const dismissLocalUi = () => {
    backdrop?.classList.add("persona-hidden");
    shell.classList.remove("persona-artifact-drawer-open");
    // Hide portaled copy menu
    copyMenuDropdown?.hide();
  };

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      dismissLocalUi();
      options.onDismiss?.();
    });
  }

  const shell = createElement(
    "aside",
    "persona-artifact-pane persona-flex persona-flex-col persona-min-h-0 persona-min-w-0 persona-bg-persona-surface persona-text-persona-primary persona-border-l persona-border-persona-border"
  );
  shell.setAttribute("data-persona-theme-zone", "artifact-pane");
  if (documentChrome) {
    shell.classList.add("persona-artifact-pane-document");
  }

  const toolbar = createElement(
    "div",
    "persona-artifact-toolbar persona-flex persona-items-center persona-justify-between persona-gap-2 persona-px-2 persona-py-2 persona-border-b persona-border-persona-border persona-shrink-0"
  );
  toolbar.setAttribute("data-persona-theme-zone", "artifact-toolbar");
  if (documentChrome) {
    toolbar.classList.add("persona-artifact-toolbar-document");
  }
  const titleEl = createElement("span", "persona-text-xs persona-font-medium persona-truncate");
  titleEl.textContent = "Artifacts";

  const closeBtn = createElement(
    "button",
    "persona-rounded-md persona-border persona-border-persona-border persona-px-2 persona-py-1 persona-text-xs persona-bg-persona-surface"
  );
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  closeBtn.setAttribute("aria-label", "Close artifacts panel");
  closeBtn.addEventListener("click", () => {
    dismissLocalUi();
    options.onDismiss?.();
  });

  /** Document preset: view vs raw source */
  let viewMode: "rendered" | "source" = "rendered";
  const leftTools = createElement("div", "persona-flex persona-items-center persona-gap-1 persona-shrink-0 persona-artifact-toggle-group");
  const viewBtn = documentChrome
    ? createIconButton({ icon: "eye", label: "Rendered view", className: "persona-artifact-doc-icon-btn persona-artifact-view-btn" })
    : createIconButton({ icon: "eye", label: "Rendered view" });
  const codeBtn = documentChrome
    ? createIconButton({ icon: "code-2", label: "Source", className: "persona-artifact-doc-icon-btn persona-artifact-code-btn" })
    : createIconButton({ icon: "code-2", label: "Source" });
  const actionsRight = createElement("div", "persona-flex persona-items-center persona-gap-1 persona-shrink-0");
  const showCopyLabel = layout?.documentToolbarShowCopyLabel === true;
  const showCopyChevron = layout?.documentToolbarShowCopyChevron === true;
  const copyMenuItems = layout?.documentToolbarCopyMenuItems;
  const showCopyMenu = Boolean(showCopyChevron && copyMenuItems && copyMenuItems.length > 0);

  let copyWrap: HTMLElement | null = null;
  let copyBtn: HTMLButtonElement;
  let copyMenuChevronBtn: HTMLButtonElement | null = null;
  let copyMenuDropdown: DropdownMenuHandle | null = null;

  if (documentChrome && (showCopyLabel || showCopyChevron) && !showCopyMenu) {
    copyBtn = showCopyLabel
      ? createLabelButton({ icon: "copy", label: "Copy", iconSize: 14, className: "persona-artifact-doc-copy-btn" })
      : createIconButton({ icon: "copy", label: "Copy", className: "persona-artifact-doc-copy-btn" });
    if (showCopyChevron) {
      const chev = renderLucideIcon("chevron-down", 14, "currentColor", 2);
      if (chev) copyBtn.appendChild(chev);
    }
  } else if (documentChrome && showCopyMenu) {
    copyWrap = createElement(
      "div",
      "persona-relative persona-inline-flex persona-items-center persona-gap-0 persona-rounded-md"
    );
    copyBtn = showCopyLabel
      ? createLabelButton({ icon: "copy", label: "Copy", iconSize: 14, className: "persona-artifact-doc-copy-btn" })
      : createIconButton({ icon: "copy", label: "Copy", className: "persona-artifact-doc-copy-btn" });
    copyMenuChevronBtn = createIconButton({
      icon: "chevron-down",
      label: "More copy options",
      size: 14,
      className: "persona-artifact-doc-copy-menu-chevron persona-artifact-doc-icon-btn",
      aria: { "aria-haspopup": "true", "aria-expanded": "false" }
    });
    copyWrap.append(copyBtn, copyMenuChevronBtn);
  } else if (documentChrome) {
    copyBtn = createIconButton({ icon: "copy", label: "Copy", className: "persona-artifact-doc-icon-btn" });
  } else {
    copyBtn = createIconButton({ icon: "copy", label: "Copy" });
  }

  const refreshBtn = documentChrome
    ? createIconButton({ icon: "refresh-cw", label: "Refresh", className: "persona-artifact-doc-icon-btn" })
    : createIconButton({ icon: "refresh-cw", label: "Refresh" });
  const closeIconBtn = documentChrome
    ? createIconButton({ icon: "x", label: "Close", className: "persona-artifact-doc-icon-btn" })
    : createIconButton({ icon: "x", label: "Close" });

  const getSelectedArtifactText = (): { markdown: string; jsonPayload: string; id: string | null } => {
    const sel = records.find((r) => r.id === selectedId) ?? records[records.length - 1];
    const id = sel?.id ?? null;
    const markdown = sel?.artifactType === "markdown" ? sel.markdown ?? "" : "";
    const jsonPayload = sel
      ? JSON.stringify({ component: sel.component, props: sel.props }, null, 2)
      : "";
    return { markdown, jsonPayload, id };
  };

  const defaultCopy = async () => {
    const { markdown, jsonPayload } = getSelectedArtifactText();
    const sel = records.find((r) => r.id === selectedId) ?? records[records.length - 1];
    const text =
      sel?.artifactType === "markdown"
        ? markdown
        : sel
          ? jsonPayload
          : "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  copyBtn.addEventListener("click", async () => {
    const handler = layout?.onDocumentToolbarCopyMenuSelect;
    if (handler && showCopyMenu) {
      const { markdown, jsonPayload, id } = getSelectedArtifactText();
      try {
        await handler({ actionId: "primary", artifactId: id, markdown, jsonPayload });
      } catch {
        /* ignore */
      }
      return;
    }
    await defaultCopy();
  });

  if (copyMenuChevronBtn && copyMenuItems?.length) {
    // Resolve the portal target — widget root for CSS var inheritance, escaping overflow: hidden
    const resolvePortal = (): HTMLElement => shell.closest("[data-persona-root]") as HTMLElement ?? document.body;

    const initDropdown = () => {
      copyMenuDropdown = createDropdownMenu({
        items: copyMenuItems.map((item) => ({ id: item.id, label: item.label })),
        onSelect: async (actionId) => {
          const { markdown, jsonPayload, id } = getSelectedArtifactText();
          const handler = layout?.onDocumentToolbarCopyMenuSelect;
          try {
            if (handler) {
              await handler({ actionId, artifactId: id, markdown, jsonPayload });
            } else if (actionId === "markdown" || actionId === "md") {
              await navigator.clipboard.writeText(markdown);
            } else if (actionId === "json" || actionId === "source") {
              await navigator.clipboard.writeText(jsonPayload);
            } else {
              await navigator.clipboard.writeText(markdown || jsonPayload);
            }
          } catch {
            /* ignore */
          }
        },
        anchor: copyWrap ?? copyMenuChevronBtn!,
        position: 'bottom-right',
        portal: resolvePortal(),
      });
    };

    // Defer init until shell is in the DOM (may not be attached yet)
    if (shell.isConnected) {
      initDropdown();
    } else {
      requestAnimationFrame(initDropdown);
    }

    copyMenuChevronBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyMenuDropdown?.toggle();
    });
  }

  refreshBtn.addEventListener("click", async () => {
    try {
      await layout?.onDocumentToolbarRefresh?.();
    } catch {
      /* ignore */
    }
    render();
  });
  closeIconBtn.addEventListener("click", () => {
    dismissLocalUi();
    options.onDismiss?.();
  });

  const syncViewToggleState = () => {
    if (!documentChrome) return;
    viewBtn.setAttribute("aria-pressed", viewMode === "rendered" ? "true" : "false");
    codeBtn.setAttribute("aria-pressed", viewMode === "source" ? "true" : "false");
  };
  viewBtn.addEventListener("click", () => {
    viewMode = "rendered";
    syncViewToggleState();
    render();
  });
  codeBtn.addEventListener("click", () => {
    viewMode = "source";
    syncViewToggleState();
    render();
  });

  const centerTitle = createElement(
    "span",
    "persona-min-w-0 persona-flex-1 persona-text-xs persona-font-medium persona-text-persona-primary persona-truncate persona-text-center md:persona-text-left"
  );

  if (documentChrome) {
    toolbar.replaceChildren();
    leftTools.append(viewBtn, codeBtn);
    if (copyWrap) {
      actionsRight.append(copyWrap, refreshBtn, closeIconBtn);
    } else {
      actionsRight.append(copyBtn, refreshBtn, closeIconBtn);
    }
    toolbar.append(leftTools, centerTitle, actionsRight);
    syncViewToggleState();
  } else {
    toolbar.appendChild(titleEl);
    toolbar.appendChild(closeBtn);
  }

  if (panePadding) {
    toolbar.style.paddingLeft = panePadding;
    toolbar.style.paddingRight = panePadding;
  }

  const list = createElement(
    "div",
    "persona-artifact-list persona-shrink-0 persona-flex persona-gap-1 persona-overflow-x-auto persona-p-2 persona-border-b persona-border-persona-border"
  );
  const content = createElement(
    "div",
    "persona-artifact-content persona-flex-1 persona-min-h-0 persona-overflow-y-auto persona-p-3"
  );
  if (panePadding) {
    list.style.paddingLeft = panePadding;
    list.style.paddingRight = panePadding;
    content.style.padding = panePadding;
  }

  shell.appendChild(toolbar);
  shell.appendChild(list);
  shell.appendChild(content);

  let records: PersonaArtifactRecord[] = [];
  let selectedId: string | null = null;
  let mobileOpen = false;

  const render = () => {
    const hideTabs = documentChrome && records.length <= 1;
    list.classList.toggle("persona-hidden", hideTabs);

    list.replaceChildren();
    for (const r of records) {
      const tab = createElement(
        "button",
        "persona-artifact-tab persona-shrink-0 persona-rounded-lg persona-px-2 persona-py-1 persona-text-xs persona-border persona-border-transparent persona-text-persona-primary"
      );
      tab.type = "button";
      tab.textContent = r.title || r.id.slice(0, 8);
      if (r.id === selectedId) {
        tab.classList.add("persona-bg-persona-container", "persona-border-persona-border");
      }
      tab.addEventListener("click", () => options.onSelect(r.id));
      list.appendChild(tab);
    }

    content.replaceChildren();
    const sel =
      (selectedId && records.find((x) => x.id === selectedId)) ||
      records[records.length - 1];
    if (!sel) return;

    if (documentChrome) {
      const kind = sel.artifactType === "markdown" ? "MD" : sel.component ?? "Component";
      const rawTitle = (sel.title || "Document").trim();
      const baseTitle = rawTitle.replace(/\s*·\s*MD\s*$/i, "").trim() || "Document";
      centerTitle.textContent = `${baseTitle} · ${kind}`;
    } else {
      titleEl.textContent = "Artifacts";
    }

    if (sel.artifactType === "markdown") {
      if (documentChrome && viewMode === "source") {
        const pre = createElement(
          "pre",
          "persona-font-mono persona-text-xs persona-whitespace-pre-wrap persona-break-words persona-text-persona-primary"
        );
        pre.textContent = sel.markdown ?? "";
        content.appendChild(pre);
        return;
      }
      const wrap = createElement("div", "persona-text-sm persona-leading-relaxed persona-markdown-bubble");
      wrap.innerHTML = toHtml(sel.markdown ?? "");
      content.appendChild(wrap);
      return;
    }

    const renderer = sel.component ? componentRegistry.get(sel.component) : undefined;
    if (renderer) {
      const stubMessage: AgentWidgetMessage = {
        id: sel.id,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString()
      };
      const ctx: ComponentContext = {
        message: stubMessage,
        config,
        updateProps: () => {}
      };
      try {
        const el = renderer(sel.props ?? {}, ctx);
        if (el) {
          content.appendChild(el);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    content.appendChild(fallbackComponentCard(sel));
  };

  const applyLayoutVisibility = () => {
    const has = records.length > 0;
    shell.classList.toggle("persona-hidden", !has);
    if (backdrop) {
      const root =
        typeof shell.closest === "function" ? shell.closest("[data-persona-root]") : null;
      const narrowHost = root?.classList.contains("persona-artifact-narrow-host") ?? false;
      const isMobile =
        narrowHost ||
        (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
      if (has && isMobile && mobileOpen) {
        backdrop.classList.remove("persona-hidden");
        shell.classList.add("persona-artifact-drawer-open");
      } else if (!isMobile) {
        backdrop.classList.add("persona-hidden");
        shell.classList.remove("persona-artifact-drawer-open");
      } else {
        // isMobile && !(has && mobileOpen): e.g. dismissed drawer — keep closed chrome in sync
        backdrop.classList.add("persona-hidden");
        shell.classList.remove("persona-artifact-drawer-open");
      }
    }
  };

  return {
    element: shell,
    backdrop,
    update(state: { artifacts: PersonaArtifactRecord[]; selectedId: string | null }) {
      records = state.artifacts;
      selectedId =
        state.selectedId ??
        state.artifacts[state.artifacts.length - 1]?.id ??
        null;
      if (records.length > 0) {
        mobileOpen = true;
      }
      render();
      applyLayoutVisibility();
    },
    setMobileOpen(open: boolean) {
      mobileOpen = open;
      if (!open && backdrop) {
        backdrop.classList.add("persona-hidden");
        shell.classList.remove("persona-artifact-drawer-open");
      } else {
        applyLayoutVisibility();
      }
    }
  };
}
