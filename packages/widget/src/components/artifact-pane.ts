import { createElement } from "../utils/dom";
import type { AgentWidgetConfig, PersonaArtifactRecord } from "../types";
import { fileTypeLabel, basenameOf } from "../utils/artifact-file";
import {
  renderArtifactPreviewBody,
  type ArtifactPreviewBodyHandle,
} from "./artifact-preview";
import { renderLucideIcon } from "../utils/icons";
import { createDropdownMenu, type DropdownMenuHandle } from "../utils/dropdown";
import { createIconButton, createLabelButton, createToggleGroup } from "../utils/buttons";

export type ArtifactPaneApi = {
  element: HTMLElement;
  /** Backdrop for mobile drawer (optional separate layer) */
  backdrop: HTMLElement | null;
  update: (state: { artifacts: PersonaArtifactRecord[]; selectedId: string | null }) => void;
  setMobileOpen: (open: boolean) => void;
};

/**
 * Right-hand artifact sidebar / mobile drawer content.
 */
export function createArtifactPane(
  config: AgentWidgetConfig,
  options: {
    onSelect: (id: string) => void;
    /** User closed the pane (mobile drawer or split sidebar): parent should persist “hidden until reopened”. */
    onDismiss?: () => void;
  }
): ArtifactPaneApi {
  const layout = config.features?.artifacts?.layout;
  const toolbarPreset = layout?.toolbarPreset ?? "default";
  const documentChrome = toolbarPreset === "document";
  const toolbarTitle = layout?.toolbarTitle ?? "Artifacts";
  const closeButtonLabel = layout?.closeButtonLabel ?? "Close";
  const panePadding = layout?.panePadding?.trim();

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
  titleEl.textContent = toolbarTitle;

  const closeBtn = createLabelButton({
    label: closeButtonLabel,
    aria: { "aria-label": closeButtonLabel },
  });
  closeBtn.addEventListener("click", () => {
    dismissLocalUi();
    options.onDismiss?.();
  });

  /** Document preset: view vs raw source */
  let viewMode: "rendered" | "source" = "rendered";
  const viewToggle = createToggleGroup({
    items: [
      {
        id: "rendered",
        icon: "eye",
        label: "Rendered view",
        className: documentChrome ? "persona-artifact-doc-icon-btn persona-artifact-view-btn" : undefined,
      },
      {
        id: "source",
        icon: "code-xml",
        label: "Source",
        className: documentChrome ? "persona-artifact-doc-icon-btn persona-artifact-code-btn" : undefined,
      },
    ],
    selectedId: "rendered",
    className: "persona-artifact-toggle-group persona-shrink-0",
    onSelect: (id) => {
      viewMode = id === "source" ? "source" : "rendered";
      render();
    },
  });
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
    ? createIconButton({ icon: "x", label: closeButtonLabel, className: "persona-artifact-doc-icon-btn" })
    : createIconButton({ icon: "x", label: closeButtonLabel });

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
    // Resolve the portal target: widget root for CSS var inheritance, escaping overflow: hidden
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

  const centerTitle = createElement(
    "span",
    "persona-min-w-0 persona-flex-1 persona-text-xs persona-font-medium persona-text-persona-primary persona-truncate persona-text-center md:persona-text-left"
  );

  if (documentChrome) {
    toolbar.replaceChildren();
    if (copyWrap) {
      actionsRight.append(copyWrap, refreshBtn, closeIconBtn);
    } else {
      actionsRight.append(copyBtn, refreshBtn, closeIconBtn);
    }
    toolbar.append(viewToggle.element, centerTitle, actionsRight);
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
  // Track the last tab we auto-scrolled to so we only nudge the strip when the
  // selection actually changes (not on every streaming re-render), which would
  // otherwise fight a user who has scrolled the strip manually.
  let lastScrolledTabId: string | null = null;

  // Shared preview body renderer (artifact-preview.ts). One handle serves the
  // whole content area; it is updated with whichever record is selected and
  // internally reuses the file-preview iframe across idle re-renders.
  let preview: ArtifactPreviewBodyHandle | null = null;
  let fileToggleMounted = false;
  const resolveViewMode = (rec: PersonaArtifactRecord): "rendered" | "source" => {
    const isFile = rec.artifactType === "markdown" && Boolean(rec.file);
    // File artifacts honor the toggle in every toolbar preset; plain markdown
    // only has a source view in the document toolbar preset.
    if (isFile) return viewMode;
    return documentChrome ? viewMode : "rendered";
  };
  // For the default (non-document) toolbar, mount the rendered/source toggle only
  // while a previewable file artifact is selected. The document toolbar already
  // carries the toggle permanently, so it is mounted once at build time. Here we
  // add/remove the group from the toolbar as the selection gains or loses a
  // previewable file (the toggle group owns its own buttons and aria-pressed state).
  const updateFileToggleVisibility = (previewable: boolean) => {
    if (documentChrome) return;
    if (previewable && !fileToggleMounted) {
      toolbar.insertBefore(viewToggle.element, titleEl);
      fileToggleMounted = true;
    } else if (!previewable && fileToggleMounted) {
      viewToggle.element.remove();
      fileToggleMounted = false;
    }
  };

  const render = () => {
    const hideTabs = documentChrome && records.length <= 1;
    list.classList.toggle("persona-hidden", hideTabs);

    list.replaceChildren();
    let activeTab: HTMLButtonElement | null = null;
    for (const r of records) {
      const tab = createElement(
        "button",
        "persona-artifact-tab persona-shrink-0 persona-rounded-lg persona-px-2 persona-py-1 persona-text-xs persona-border persona-border-transparent persona-text-persona-primary"
      );
      tab.type = "button";
      // Prefer the file basename over the full path so tabs stay readable
      // (matches the toolbar title); keep the full path/title in a tooltip.
      const fileMeta = r.artifactType === "markdown" ? r.file : undefined;
      const label = fileMeta ? basenameOf(fileMeta.path) : r.title || r.id.slice(0, 8);
      const tooltip = fileMeta?.path || r.title || label;
      tab.textContent = label;
      tab.title = tooltip;
      tab.setAttribute("aria-label", tooltip);
      if (r.id === selectedId) {
        tab.classList.add("persona-bg-persona-container", "persona-border-persona-border");
        activeTab = tab;
      }
      tab.addEventListener("click", () => options.onSelect(r.id));
      list.appendChild(tab);
    }

    // Keep the selected tab visible when the selection changes (e.g. a new
    // artifact streams in and auto-selects). `inline: "nearest"` is a no-op
    // when the tab is already visible, so this never yanks the strip needlessly.
    if (activeTab && selectedId !== lastScrolledTabId) {
      lastScrolledTabId = selectedId;
      if (typeof activeTab.scrollIntoView === "function") {
        activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    const sel =
      (selectedId && records.find((x) => x.id === selectedId)) ||
      records[records.length - 1];
    if (!sel) {
      content.replaceChildren();
      preview = null;
      updateFileToggleVisibility(false);
      return;
    }

    const selFile = sel.artifactType === "markdown" ? sel.file : undefined;

    // Expose the rendered/source toggle for previewable file artifacts even
    // outside the document toolbar preset.
    updateFileToggleVisibility(Boolean(selFile));

    if (documentChrome) {
      const kind = selFile
        ? fileTypeLabel(selFile)
        : sel.artifactType === "markdown"
          ? "MD"
          : sel.component ?? "Component";
      const rawTitle = (sel.title || "Document").trim();
      const baseTitle = selFile
        ? basenameOf(selFile.path)
        : rawTitle.replace(/\s*·\s*MD\s*$/i, "").trim() || "Document";
      centerTitle.textContent = `${baseTitle} · ${kind}`;
    } else {
      titleEl.textContent = selFile ? basenameOf(selFile.path) : toolbarTitle;
    }

    // Delegate the body to the shared preview renderer. Keep the handle's
    // element attached across updates: re-attaching would reload a live
    // file-preview iframe.
    if (!preview) {
      preview = renderArtifactPreviewBody(sel, { config, resolveViewMode });
      content.replaceChildren(preview.el);
    } else {
      if (preview.el.parentElement !== content) {
        content.replaceChildren(preview.el);
      }
      preview.update(sel);
    }
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
        // isMobile && !(has && mobileOpen): e.g. dismissed drawer: keep closed chrome in sync
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
