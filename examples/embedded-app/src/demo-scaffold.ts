/**
 * Shared layout scaffold for the advanced Persona examples.
 *
 * Standardizes every demo page into two columns under the persistent top nav:
 *   1. Configure: the left rail (`.stage-controls`): a unified header plus the
 *      page's per-demo controls.
 *   2. Preview: the right pane (`.preview`). Its toolbar carries a
 *      Preview | Code mode toggle on the left and the variant selectors on the
 *      right (the mount-mode pills built by `setupMountMode`, plus an optional
 *      per-demo variant control). Below the toolbar, the body swaps in place
 *      between the live widget (`.stage-widget`) and the config inspector
 *      (`.preview-codepane`) depending on the selected mode.
 *
 * Each page authors only its per-demo controls inside `.stage-controls` and a
 * `.stage-widget` mount target. This helper adopts that markup and builds the
 * header, toolbar, mode toggle, and code pane around it. Call it ONCE, before
 * `createDemoConfigInspector`, so the inspector resolves the
 * `[data-config-inspector]` slot inside the code pane.
 */

import { getExample } from "./examples-nav";

export type DemoVariantOption = {
  id: string;
  label: string;
  description?: string;
};

export type DemoVariantsConfig = {
  /** Toolbar label for the variant group. Defaults to "Variant". */
  label?: string;
  /** Variant options, in display order. */
  options: DemoVariantOption[];
  /** Initially-selected id. Defaults to the first option. */
  initial?: string;
  /** Called when the user picks a variant. */
  onSelect: (id: string) => void;
};

export type DemoScaffoldOptions = {
  /** Looked up in the examples registry for the default title/blurb. */
  slug: string;
  /** Override the registry title. */
  title?: string;
  /** Override the registry blurb. */
  blurb?: string;
  /** Optional per-demo variant selector rendered in the preview toolbar. */
  variants?: DemoVariantsConfig;
};

/**
 * Controls the right-pane Preview | Code mode switch. Retained under the
 * `output` name (and `open`/`close` semantics) for backward compatibility with
 * the previous slide-in drawer API: `open()` shows the code pane, `close()`
 * shows the live preview.
 */
export type DemoOutputPanel = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  readonly isOpen: boolean;
  destroy: () => void;
};

export type DemoScaffold = {
  /** The `.shell-main` root. */
  root: HTMLElement;
  /** `[data-demo-controls]`: per-demo controls live here. */
  controlsSlot: HTMLElement;
  /** `[data-mount-toolbar]`: the mount-mode pill group renders here. */
  toolbarSlot: HTMLElement;
  /** `[data-variant-toolbar]`: optional per-demo variant selectors render here. */
  variantSlot: HTMLElement;
  /** `.stage-widget`: the widget mount target (inside the preview pane). */
  stage: HTMLElement;
  /** `[data-config-inspector]`: inside the preview code pane. */
  inspectorSlot: HTMLElement;
  /** Preview | Code mode switch controller. */
  output: DemoOutputPanel;
  destroy: () => void;
};

type PreviewMode = "preview" | "code";

function createPreviewModeController(
  preview: HTMLElement,
  toggle: HTMLElement,
): { panel: DemoOutputPanel; destroy: () => void } {
  let mode: PreviewMode = "preview";

  const buttons = Array.from(
    toggle.querySelectorAll<HTMLButtonElement>(".preview-mode-button"),
  );

  const setMode = (next: PreviewMode): void => {
    if (next === mode) return;
    mode = next;
    preview.classList.toggle("preview--code", mode === "code");
    // Launcher-mode demos mount the widget as a viewport-fixed element on
    // `<body>` (outside `.stage-widget`), so hiding the stage alone leaves the
    // floating launcher visible. Toggle a body flag that hides every Persona
    // widget root while the code pane is shown.
    document.body.classList.toggle("demo-code-active", mode === "code");
    buttons.forEach((btn) =>
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.mode === mode ? "true" : "false",
      ),
    );
  };

  const onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      ".preview-mode-button",
    );
    const next = btn?.dataset.mode as PreviewMode | undefined;
    if (next) setMode(next);
  };
  toggle.addEventListener("click", onClick);

  // Entering fullscreen hides the toolbar; if we were in code mode, the live
  // widget would re-mount behind a hidden `.stage-widget`. Snap back to preview
  // whenever the body flips into fullscreen.
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("is-fullscreen")) setMode("preview");
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  const panel: DemoOutputPanel = {
    get isOpen() {
      return mode === "code";
    },
    open() {
      setMode("code");
    },
    close() {
      setMode("preview");
    },
    toggle() {
      setMode(mode === "code" ? "preview" : "code");
    },
    destroy() {
      toggle.removeEventListener("click", onClick);
      observer.disconnect();
      document.body.classList.remove("demo-code-active");
    },
  };

  return {
    panel,
    destroy: () => panel.destroy(),
  };
}

function buildVariantToggle(
  slot: HTMLElement,
  variants: DemoVariantsConfig,
): void {
  const label = variants.label ?? "Variant";
  let current = variants.initial ?? variants.options[0]?.id;
  slot.classList.add("mount-toggle");
  slot.innerHTML = `
    <span class="mount-toggle-label">${label}</span>
    <div class="mount-toggle-group" role="group" aria-label="${label}">
      ${variants.options
        .map(
          (opt) =>
            `<button type="button" class="mount-toggle-button" data-variant="${opt.id}" aria-pressed="${opt.id === current ? "true" : "false"}"${opt.description ? ` title="${opt.description}"` : ""}>${opt.label}</button>`,
        )
        .join("")}
    </div>
  `;
  slot.querySelectorAll<HTMLButtonElement>(".mount-toggle-button").forEach(
    (btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.variant;
        if (!id || id === current) return;
        current = id;
        slot
          .querySelectorAll<HTMLButtonElement>(".mount-toggle-button")
          .forEach((b) =>
            b.setAttribute(
              "aria-pressed",
              b.dataset.variant === id ? "true" : "false",
            ),
          );
        variants.onSelect(id);
      });
    },
  );
}

export function renderDemoScaffold(
  options: DemoScaffoldOptions,
): DemoScaffold {
  const { slug } = options;
  const registry = getExample(slug);
  const title = options.title ?? registry?.title ?? slug;
  const blurb = options.blurb ?? registry?.blurb ?? "";

  const root = document.querySelector<HTMLElement>(".shell-main");
  if (!root) {
    throw new Error("[demo-scaffold] No `.shell-main` found on the page.");
  }
  // Pin the demo layout to the viewport (desktop) so the preview owns a fixed,
  // full-height right column and only the left rail scrolls. See `.demo-shell`.
  root.classList.add("demo-shell");
  const stage = root.querySelector<HTMLElement>(".stage-widget");
  if (!stage) {
    throw new Error("[demo-scaffold] No `.stage-widget` found on the page.");
  }

  // The scaffold builds its own header and owns the inspector slot; drop any
  // full-width page header and author-placed inspector anywhere in the page.
  root
    .querySelectorAll(".title-strip, [data-config-inspector]")
    .forEach((el) => el.remove());

  // Force the two-column stage layout (some pages ship a full-width variant).
  stage.closest(".stage")?.classList.remove("stage--full");

  // ── 1. Configure rail ────────────────────────────────────────────────
  let controls = root.querySelector<HTMLElement>(".stage-controls");
  if (!controls) {
    controls = document.createElement("aside");
    controls.className = "stage-controls";
    stage.parentElement?.insertBefore(controls, stage);
  }

  // Drop any author-provided header / toolbar: the scaffold owns these.
  // Everything else in the rail is treated as per-demo controls.
  controls
    .querySelectorAll(".demo-meta, .demo-header, .title-strip, [data-mount-toolbar]")
    .forEach((el) => el.remove());

  const authoredControls = Array.from(controls.childNodes);

  const header = document.createElement("header");
  header.className = "demo-header";

  const headerTitle = document.createElement("h1");
  headerTitle.className = "demo-header-title";
  headerTitle.textContent = title;
  header.appendChild(headerTitle);
  if (blurb) {
    const headerBlurb = document.createElement("p");
    headerBlurb.className = "demo-header-blurb";
    headerBlurb.textContent = blurb;
    header.appendChild(headerBlurb);
  }

  const configureSection = document.createElement("section");
  configureSection.className = "configure-section";
  const configureLabel = document.createElement("span");
  configureLabel.className = "configure-label";
  configureLabel.textContent = "Configure";
  const controlsSlot = document.createElement("div");
  controlsSlot.setAttribute("data-demo-controls", "");
  authoredControls.forEach((node) => controlsSlot.appendChild(node));
  configureSection.append(configureLabel, controlsSlot);

  controls.replaceChildren(header, configureSection);

  // ── 1b. Notes → collapsible at the bottom of the left rail ───────────
  // Authored as a full-width `.notes` section below the stage; relocate it
  // into the configure rail as a show/hide so the preview owns the full
  // right column (and a docked launcher reads as bottom-of-screen).
  const notes = root.querySelector<HTMLElement>(".notes");
  if (notes) {
    notes.querySelector(".notes-heading")?.remove();
    const notesRail = document.createElement("section");
    notesRail.className = "notes-rail";
    const notesToggle = document.createElement("button");
    notesToggle.type = "button";
    notesToggle.className = "notes-rail-toggle";
    notesToggle.setAttribute("aria-expanded", "false");
    notesToggle.textContent = "Notes";
    const notesBody = document.createElement("div");
    notesBody.className = "notes notes-rail-body";
    notesBody.hidden = true;
    while (notes.firstChild) notesBody.appendChild(notes.firstChild);
    notes.remove();
    notesToggle.addEventListener("click", () => {
      const open = notesToggle.getAttribute("aria-expanded") === "true";
      notesToggle.setAttribute("aria-expanded", open ? "false" : "true");
      notesBody.hidden = open;
    });
    notesRail.append(notesToggle, notesBody);
    controls.appendChild(notesRail);
  }

  // ── 2. Preview pane ──────────────────────────────────────────────────
  const preview = document.createElement("div");
  preview.className = "preview";

  const previewToolbar = document.createElement("div");
  previewToolbar.className = "preview-toolbar";

  // Preview | Code mode toggle (left).
  const modeToggle = document.createElement("div");
  modeToggle.className = "preview-mode-toggle";
  modeToggle.setAttribute("role", "group");
  modeToggle.setAttribute("aria-label", "Preview mode");
  modeToggle.innerHTML = `
    <button type="button" class="preview-mode-button" data-mode="preview" aria-pressed="true">Preview</button>
    <button type="button" class="preview-mode-button" data-mode="code" aria-pressed="false">Code</button>
  `;

  // Variant selectors (right): mount-mode pills + optional per-demo variants.
  const variants = document.createElement("div");
  variants.className = "preview-toolbar-variants";
  const toolbarSlot = document.createElement("div");
  toolbarSlot.className = "mount-toolbar";
  toolbarSlot.setAttribute("data-mount-toolbar", "");
  const variantSlot = document.createElement("div");
  variantSlot.setAttribute("data-variant-toolbar", "");
  variants.append(variantSlot, toolbarSlot);

  previewToolbar.append(modeToggle, variants);

  // Body: live widget + code pane, swapped by the `.preview--code` class.
  const body = document.createElement("div");
  body.className = "preview-body";
  const codepane = document.createElement("div");
  codepane.className = "preview-codepane";
  const inspectorSlot = document.createElement("div");
  inspectorSlot.setAttribute("data-config-inspector", "");
  codepane.appendChild(inspectorSlot);

  stage.parentElement?.insertBefore(preview, stage);
  body.appendChild(stage);
  body.appendChild(codepane);
  preview.append(previewToolbar, body);

  if (options.variants) {
    buildVariantToggle(variantSlot, options.variants);
  }

  const mode = createPreviewModeController(preview, modeToggle);

  return {
    root,
    controlsSlot,
    toolbarSlot,
    variantSlot,
    stage,
    inspectorSlot,
    output: mode.panel,
    destroy() {
      mode.destroy();
    },
  };
}
