import { createElement } from "../utils/dom";
import type { AgentWidgetConfig, AgentWidgetMessage, PersonaArtifactRecord } from "../types";
import { escapeHtml, createMarkdownProcessorFromConfig } from "../postprocessors";
import { componentRegistry, type ComponentContext } from "./registry";
import { renderLucideIcon } from "../utils/icons";

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

function iconButton(iconName: string, label: string, extraClass = ""): HTMLButtonElement {
  const btn = createElement(
    "button",
    `persona-inline-flex persona-items-center persona-justify-center persona-rounded-md persona-border persona-border-persona-border persona-bg-persona-surface persona-p-1 persona-text-persona-primary hover:persona-bg-persona-container ${extraClass}`
  ) as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  const icon = renderLucideIcon(iconName, 16, "currentColor", 2);
  if (icon) btn.appendChild(icon);
  return btn;
}

function documentToolbarIconButton(
  iconName: string,
  label: string,
  extraClass: string
): HTMLButtonElement {
  const btn = createElement(
    "button",
    `persona-artifact-doc-icon-btn ${extraClass}`.trim()
  ) as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  const icon = renderLucideIcon(iconName, 16, "currentColor", 2);
  if (icon) btn.appendChild(icon);
  return btn;
}

function documentToolbarCopyMainButton(showLabel: boolean): HTMLButtonElement {
  const btn = createElement("button", "persona-artifact-doc-copy-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-label", "Copy");
  btn.title = "Copy";
  const icon = renderLucideIcon("copy", showLabel ? 14 : 16, "currentColor", 2);
  if (icon) btn.appendChild(icon);
  if (showLabel) {
    const span = createElement("span", "persona-artifact-doc-copy-label");
    span.textContent = "Copy";
    btn.appendChild(span);
  }
  return btn;
}

function documentToolbarChevronMenuButton(): HTMLButtonElement {
  const btn = createElement(
    "button",
    "persona-artifact-doc-copy-menu-chevron persona-artifact-doc-icon-btn"
  ) as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-label", "More copy options");
  btn.setAttribute("aria-haspopup", "true");
  btn.setAttribute("aria-expanded", "false");
  const chev = renderLucideIcon("chevron-down", 14, "currentColor", 2);
  if (chev) btn.appendChild(chev);
  return btn;
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
  const toHtml = (text: string) => (md ? md(text) : escapeHtml(text));

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
  if (documentChrome) {
    shell.classList.add("persona-artifact-pane-document");
  }

  const toolbar = createElement(
    "div",
    "persona-artifact-toolbar persona-flex persona-items-center persona-justify-between persona-gap-2 persona-px-2 persona-py-2 persona-border-b persona-border-persona-border persona-shrink-0"
  );
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
  const leftTools = createElement("div", "persona-flex persona-items-center persona-gap-1 persona-shrink-0");
  const viewBtn = documentChrome
    ? documentToolbarIconButton("eye", "Rendered view", "persona-artifact-view-btn")
    : iconButton("eye", "Rendered view", "");
  const codeBtn = documentChrome
    ? documentToolbarIconButton("code-2", "Source", "persona-artifact-code-btn")
    : iconButton("code-2", "Source", "");
  const actionsRight = createElement("div", "persona-flex persona-items-center persona-gap-1 persona-shrink-0");
  const showCopyLabel = layout?.documentToolbarShowCopyLabel === true;
  const showCopyChevron = layout?.documentToolbarShowCopyChevron === true;
  const copyMenuItems = layout?.documentToolbarCopyMenuItems;
  const showCopyMenu = Boolean(showCopyChevron && copyMenuItems && copyMenuItems.length > 0);

  let copyWrap: HTMLElement | null = null;
  let copyBtn: HTMLButtonElement;
  let copyMenuChevronBtn: HTMLButtonElement | null = null;
  let copyMenuEl: HTMLElement | null = null;

  if (documentChrome && (showCopyLabel || showCopyChevron) && !showCopyMenu) {
    copyBtn = documentToolbarCopyMainButton(showCopyLabel);
    if (showCopyChevron) {
      const chev = renderLucideIcon("chevron-down", 14, "currentColor", 2);
      if (chev) copyBtn.appendChild(chev);
    }
  } else if (documentChrome && showCopyMenu) {
    copyWrap = createElement(
      "div",
      "persona-relative persona-inline-flex persona-items-center persona-gap-0 persona-rounded-md"
    );
    copyBtn = documentToolbarCopyMainButton(showCopyLabel);
    copyMenuChevronBtn = documentToolbarChevronMenuButton();
    copyWrap.append(copyBtn, copyMenuChevronBtn);
    copyMenuEl = createElement(
      "div",
      "persona-artifact-doc-copy-menu persona-absolute persona-right-0 persona-top-full persona-z-20 persona-mt-1 persona-min-w-[10rem] persona-rounded-md persona-border persona-border-persona-border persona-bg-persona-surface persona-py-1 persona-shadow-md persona-hidden"
    );
    copyWrap.appendChild(copyMenuEl);
    for (const item of copyMenuItems!) {
      const opt = createElement(
        "button",
        "persona-block persona-w-full persona-text-left persona-px-3 persona-py-2 persona-text-xs persona-text-persona-primary hover:persona-bg-persona-container"
      ) as HTMLButtonElement;
      opt.type = "button";
      opt.textContent = item.label;
      opt.dataset.copyMenuId = item.id;
      copyMenuEl.appendChild(opt);
    }
  } else if (documentChrome) {
    copyBtn = documentToolbarIconButton("copy", "Copy", "");
  } else {
    copyBtn = iconButton("copy", "Copy", "");
  }

  const refreshBtn = documentChrome
    ? documentToolbarIconButton("refresh-cw", "Refresh", "")
    : iconButton("refresh-cw", "Refresh", "");
  const closeIconBtn = documentChrome
    ? documentToolbarIconButton("x", "Close", "")
    : iconButton("x", "Close", "");

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

  if (copyMenuChevronBtn && copyMenuEl) {
    const closeMenu = () => {
      copyMenuEl!.classList.add("persona-hidden");
      copyMenuChevronBtn!.setAttribute("aria-expanded", "false");
    };
    copyMenuChevronBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = copyMenuEl!.classList.contains("persona-hidden");
      if (open) {
        copyMenuEl!.classList.remove("persona-hidden");
        copyMenuChevronBtn!.setAttribute("aria-expanded", "true");
      } else {
        closeMenu();
      }
    });
    if (typeof document !== "undefined") {
      document.addEventListener("click", closeMenu);
    }
    copyMenuEl.addEventListener("click", async (e) => {
      const t = (e.target as HTMLElement).closest("button[data-copy-menu-id]") as HTMLButtonElement | null;
      if (!t?.dataset.copyMenuId) return;
      e.stopPropagation();
      const actionId = t.dataset.copyMenuId;
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
      closeMenu();
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
        "persona-artifact-tab persona-shrink-0 persona-rounded-lg persona-px-2 persona-py-1 persona-text-xs persona-border persona-border-transparent persona-text-persona-primary hover:persona-bg-persona-container"
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
        typeof shell.closest === "function" ? shell.closest("#persona-root") : null;
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
