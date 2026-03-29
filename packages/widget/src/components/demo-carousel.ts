import { createElement } from "../utils/dom";
import { createIconButton } from "../utils/buttons";
import { createToggleGroup } from "../utils/buttons";
import { renderLucideIcon } from "../utils/icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DemoCarouselItem {
  /** URL to load in the iframe (relative or absolute). */
  url: string;
  /** Display title shown in the toolbar. */
  title: string;
  /** Optional subtitle/description. */
  description?: string;
}

export interface DemoCarouselOptions {
  /** Demo pages to cycle through. */
  items: DemoCarouselItem[];
  /** Initial item index. Default: 0. */
  initialIndex?: number;
  /** Initial device viewport. Default: 'desktop'. */
  initialDevice?: "desktop" | "mobile";
  /** Initial color scheme for the iframe wrapper. Default: 'light'. */
  initialColorScheme?: "light" | "dark";
  /** Show zoom +/- controls. Default: true. */
  showZoomControls?: boolean;
  /** Show desktop/mobile toggle. Default: true. */
  showDeviceToggle?: boolean;
  /** Show light/dark scheme toggle. Default: true. */
  showColorSchemeToggle?: boolean;
  /** Called when the active demo changes. */
  onChange?: (index: number, item: DemoCarouselItem) => void;
}

export interface DemoCarouselHandle {
  /** Root element (already appended to the container). */
  element: HTMLElement;
  /** Navigate to a demo by index. */
  goTo(index: number): void;
  /** Go to the next demo. */
  next(): void;
  /** Go to the previous demo. */
  prev(): void;
  /** Current demo index. */
  getIndex(): number;
  /** Change the device viewport. */
  setDevice(device: "desktop" | "mobile"): void;
  /** Change the wrapper color scheme. */
  setColorScheme(scheme: "light" | "dark"): void;
  /** Override zoom level (null = auto-fit). */
  setZoom(zoom: number | null): void;
  /** Tear down listeners, observer, and DOM. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_DIMENSIONS: Record<string, { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  mobile: { w: 390, h: 844 },
};

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const STAGE_PADDING = 24;
const SHADOW_MARGIN = 40;

// ---------------------------------------------------------------------------
// Injected CSS (self-contained, prefixed persona-dc-)
// ---------------------------------------------------------------------------

const CAROUSEL_CSS = /* css */ `
/* ── Root ── */
.persona-dc-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  color: #111827;
  line-height: 1.4;
}

/* ── Toolbar ── */
.persona-dc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  flex-wrap: wrap;
}
.persona-dc-toolbar-lead {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.persona-dc-toolbar-trail {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.persona-dc-title-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  max-width: 240px;
  background: none;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  padding: 4px 6px;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.persona-dc-title-btn:hover {
  background: #f3f4f6;
  border-color: #e5e7eb;
}
.persona-dc-title-btn .persona-dc-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.persona-dc-title-btn .persona-dc-title-chevron {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.persona-dc-title-btn[aria-expanded="true"] .persona-dc-title-chevron {
  transform: rotate(180deg);
}

/* ── Title dropdown ── */
.persona-dc-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 220px;
  max-width: 320px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
  padding: 4px;
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}
.persona-dc-root .persona-dc-dropdown button.persona-dc-dropdown-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: #111827;
  transition: background-color 0.1s ease;
}
.persona-dc-root .persona-dc-dropdown button.persona-dc-dropdown-item:hover {
  background: #f3f4f6;
}
.persona-dc-root .persona-dc-dropdown button.persona-dc-dropdown-item[aria-current="true"] {
  background: #f5f5f5;
  color: #0f0f0f;
}
.persona-dc-root .persona-dc-dropdown-desc {
  font-weight: 400;
  font-size: 12px;
  color: #6b7280;
  margin-top: 1px;
  text-align: left;
}
.persona-dc-root .persona-dc-dropdown button.persona-dc-dropdown-item[aria-current="true"] .persona-dc-dropdown-desc {
  color: #737373;
}
.persona-dc-counter {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}
.persona-dc-zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}
.persona-dc-zoom-level {
  font-size: 12px;
  color: #6b7280;
  min-width: 36px;
  text-align: center;
  user-select: none;
}
.persona-dc-separator {
  width: 1px;
  height: 20px;
  background: #e5e7eb;
  flex-shrink: 0;
}

/* ── Stage ── */
.persona-dc-stage {
  height: 550px;
  min-height: 400px;
  padding: ${STAGE_PADDING}px;
  overflow: auto;
  background: #f0f1f3;
  background-image: radial-gradient(circle, #e0e1e5 1px, transparent 1px);
  background-size: 24px 24px;
  border: 1px solid #e5e7eb;
  border-radius: 0 0 10px 10px;
  display: flex;
}

/* ── Iframe wrapper ── */
.persona-dc-iframe-wrapper {
  position: relative;
  overflow: hidden;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  margin: auto;
  flex-shrink: 0;
  transition: border-radius 0.2s ease;
}
.persona-dc-iframe-wrapper[data-color-scheme="dark"] {
  background: #0f172a;
}

/* ── Iframe ── */
.persona-dc-iframe {
  border: none;
  display: block;
  background: #fff;
  transform-origin: top left;
}
.persona-dc-iframe-wrapper[data-color-scheme="dark"] .persona-dc-iframe {
  background: #0f172a;
}

/* ── Button/toggle base styles (standalone, no widget.css dependency) ── */
.persona-dc-root .persona-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
  cursor: pointer;
  line-height: 1;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.persona-dc-root .persona-icon-btn:hover {
  background: #f3f4f6;
}
.persona-dc-root .persona-icon-btn:focus-visible {
  outline: 2px solid #171717;
  outline-offset: 2px;
}
.persona-dc-root .persona-icon-btn[aria-pressed="true"] {
  background: #f3f4f6;
  border-color: #d1d5db;
}
.persona-dc-root .persona-toggle-group {
  display: inline-flex;
  gap: 0;
}
.persona-dc-root .persona-toggle-group > .persona-icon-btn {
  border-radius: 0;
}
.persona-dc-root .persona-toggle-group > .persona-icon-btn:first-child {
  border-top-left-radius: 0.375rem;
  border-bottom-left-radius: 0.375rem;
}
.persona-dc-root .persona-toggle-group > .persona-icon-btn:last-child {
  border-top-right-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .persona-dc-toolbar {
    gap: 8px;
  }
  .persona-dc-zoom-controls {
    display: none;
  }
  .persona-dc-stage {
    height: 400px;
    min-height: 300px;
  }
}
`;

function injectStyles(): void {
  if (document.querySelector("style[data-persona-dc-styles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-persona-dc-styles", "");
  style.textContent = CAROUSEL_CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Scale helpers (ported from theme editor)
// ---------------------------------------------------------------------------

function computeFitScale(
  stage: HTMLElement,
  dims: { w: number; h: number },
): number {
  const availW = stage.clientWidth - STAGE_PADDING * 2 - SHADOW_MARGIN;
  const availH = stage.clientHeight - STAGE_PADDING * 2 - SHADOW_MARGIN;
  if (availW <= 0 || availH <= 0) return 1;
  return Math.min(availW / dims.w, availH / dims.h, 1);
}

function applyScale(
  wrapper: HTMLElement,
  iframe: HTMLIFrameElement,
  dims: { w: number; h: number },
  scale: number,
  device: string,
): void {
  wrapper.style.width = `${dims.w * scale}px`;
  wrapper.style.height = `${dims.h * scale}px`;
  wrapper.style.borderRadius =
    device === "mobile" ? `${32 * scale}px` : "10px";

  iframe.style.width = `${dims.w}px`;
  iframe.style.height = `${dims.h}px`;
  iframe.style.transformOrigin = "top left";
  iframe.style.transform = `scale(${scale})`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDemoCarousel(
  container: HTMLElement,
  options: DemoCarouselOptions,
): DemoCarouselHandle {
  const {
    items,
    initialIndex = 0,
    initialDevice = "desktop",
    initialColorScheme = "light",
    showZoomControls = true,
    showDeviceToggle = true,
    showColorSchemeToggle = true,
    onChange,
  } = options;

  if (items.length === 0) {
    throw new Error("createDemoCarousel: items array must not be empty");
  }

  injectStyles();

  // ── State ──
  let currentIndex = Math.max(0, Math.min(initialIndex, items.length - 1));
  let currentDevice = initialDevice;
  let currentScheme = initialColorScheme;
  let zoomOverride: number | null = null;
  let lastAutoScale = 1;
  let destroyed = false;

  // ── DOM ──
  const root = createElement("div", "persona-dc-root");

  // Toolbar
  const toolbar = createElement("div", "persona-dc-toolbar");
  const toolbarLead = createElement("div", "persona-dc-toolbar-lead");
  const toolbarTrail = createElement("div", "persona-dc-toolbar-trail");

  // Prev / title / next / counter
  const prevBtn = createIconButton({
    icon: "chevron-left",
    label: "Previous demo",
    size: 14,
    onClick: () => navigate(-1),
  });

  // Title button with dropdown
  const titleWrap = createElement("div");
  titleWrap.style.position = "relative";

  const titleBtn = createElement("button", "persona-dc-title-btn");
  titleBtn.type = "button";
  titleBtn.setAttribute("aria-expanded", "false");
  titleBtn.setAttribute("aria-haspopup", "listbox");
  const titleText = createElement("span", "persona-dc-title-text");
  const titleChevron = createElement("span", "persona-dc-title-chevron");
  const chevronSvg = renderLucideIcon("chevron-down", 12, "currentColor", 2);
  if (chevronSvg) titleChevron.appendChild(chevronSvg);
  titleBtn.append(titleText, titleChevron);

  // Dropdown list
  const dropdown = createElement("div", "persona-dc-dropdown");
  dropdown.setAttribute("role", "listbox");
  dropdown.style.display = "none";
  let dropdownOpen = false;

  function buildDropdownItems(): void {
    dropdown.innerHTML = "";
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const btn = createElement("button", "persona-dc-dropdown-item");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-current", i === currentIndex ? "true" : "false");
      const titleSpan = createElement("span");
      titleSpan.textContent = item.title;
      btn.appendChild(titleSpan);
      if (item.description) {
        const desc = createElement("span", "persona-dc-dropdown-desc");
        desc.textContent = item.description;
        btn.appendChild(desc);
      }
      btn.addEventListener("click", () => {
        closeDropdown();
        goTo(i);
      });
      dropdown.appendChild(btn);
    }
  }

  function toggleDropdown(): void {
    dropdownOpen = !dropdownOpen;
    dropdown.style.display = dropdownOpen ? "" : "none";
    titleBtn.setAttribute("aria-expanded", dropdownOpen ? "true" : "false");
    if (dropdownOpen) buildDropdownItems();
  }

  function closeDropdown(): void {
    if (!dropdownOpen) return;
    dropdownOpen = false;
    dropdown.style.display = "none";
    titleBtn.setAttribute("aria-expanded", "false");
  }

  titleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Close on outside click
  const onDocClick = (): void => closeDropdown();
  document.addEventListener("click", onDocClick);

  titleWrap.append(titleBtn, dropdown);

  const nextBtn = createIconButton({
    icon: "chevron-right",
    label: "Next demo",
    size: 14,
    onClick: () => navigate(1),
  });

  const counterEl = createElement("span", "persona-dc-counter");

  toolbarLead.append(prevBtn, titleWrap, nextBtn, counterEl);

  // Device toggle
  let deviceToggle: ReturnType<typeof createToggleGroup> | null = null;
  if (showDeviceToggle) {
    deviceToggle = createToggleGroup({
      items: [
        { id: "desktop", icon: "monitor", label: "Desktop" },
        { id: "mobile", icon: "smartphone", label: "Mobile" },
      ],
      selectedId: currentDevice,
      onSelect: (id) => {
        currentDevice = id as "desktop" | "mobile";
        wrapper.dataset.device = currentDevice;
        zoomOverride = null;
        rescale();
      },
    });
    toolbarTrail.appendChild(deviceToggle.element);
  }

  // Zoom controls
  let zoomLevelEl: HTMLSpanElement | null = null;
  if (showZoomControls) {
    const zoomWrap = createElement("div", "persona-dc-zoom-controls");
    const zoomOut = createIconButton({
      icon: "minus",
      label: "Zoom out",
      size: 14,
      onClick: () => {
        const current = zoomOverride ?? lastAutoScale;
        zoomOverride = Math.max(ZOOM_MIN, current - ZOOM_STEP);
        rescale();
      },
    });
    zoomLevelEl = createElement("span", "persona-dc-zoom-level");
    zoomLevelEl.title = "Reset to 100%";
    zoomLevelEl.style.cursor = "pointer";
    zoomLevelEl.addEventListener("click", () => {
      zoomOverride = 1;
      rescale();
    });
    const zoomIn = createIconButton({
      icon: "plus",
      label: "Zoom in",
      size: 14,
      onClick: () => {
        const current = zoomOverride ?? lastAutoScale;
        zoomOverride = Math.min(ZOOM_MAX, current + ZOOM_STEP);
        rescale();
      },
    });
    const zoomFit = createIconButton({
      icon: "maximize",
      label: "Fit to view",
      size: 14,
      onClick: () => {
        zoomOverride = null;
        rescale();
      },
    });
    zoomWrap.append(zoomOut, zoomLevelEl, zoomIn, zoomFit);
    toolbarTrail.appendChild(zoomWrap);
  }

  // Color scheme toggle
  if (showColorSchemeToggle) {
    const sep = createElement("div", "persona-dc-separator");
    toolbarTrail.appendChild(sep);
    const schemeToggle = createToggleGroup({
      items: [
        { id: "light", icon: "sun", label: "Light" },
        { id: "dark", icon: "moon", label: "Dark" },
      ],
      selectedId: currentScheme,
      onSelect: (id) => {
        currentScheme = id as "light" | "dark";
        wrapper.dataset.colorScheme = currentScheme;
        applySchemeToIframe();
      },
    });
    toolbarTrail.appendChild(schemeToggle.element);
  }

  // Open in new tab
  const sep2 = createElement("div", "persona-dc-separator");
  toolbarTrail.appendChild(sep2);
  const openBtn = createIconButton({
    icon: "external-link",
    label: "Open in new tab",
    size: 14,
    onClick: () => {
      window.open(items[currentIndex].url, "_blank");
    },
  });
  toolbarTrail.appendChild(openBtn);

  toolbar.append(toolbarLead, toolbarTrail);

  // Stage + iframe
  const stage = createElement("div", "persona-dc-stage");
  const wrapper = createElement("div", "persona-dc-iframe-wrapper");
  wrapper.dataset.device = currentDevice;
  wrapper.dataset.colorScheme = currentScheme;

  const iframe = createElement("iframe", "persona-dc-iframe");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  iframe.setAttribute("loading", "lazy");
  iframe.title = items[currentIndex].title;

  wrapper.appendChild(iframe);
  stage.appendChild(wrapper);
  root.append(toolbar, stage);
  container.appendChild(root);

  // ── Logic ──

  function applySchemeToIframe(): void {
    try {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      if (currentScheme === "dark") {
        body.classList.add("theme-dark");
      } else {
        body.classList.remove("theme-dark");
      }
    } catch {
      // Cross-origin iframe — silently ignore
    }
  }

  // Re-apply scheme after iframe loads new content
  iframe.addEventListener("load", () => applySchemeToIframe());

  function updateDisplay(): void {
    const item = items[currentIndex];
    titleText.textContent = item.title;
    counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
    iframe.title = item.title;
  }

  function navigate(delta: number): void {
    const next = ((currentIndex + delta) % items.length + items.length) % items.length;
    goTo(next);
  }

  function goTo(index: number): void {
    if (index < 0 || index >= items.length) return;
    currentIndex = index;
    iframe.src = items[currentIndex].url;
    updateDisplay();
    onChange?.(currentIndex, items[currentIndex]);
  }

  function rescale(): void {
    if (destroyed) return;
    const dims = DEVICE_DIMENSIONS[currentDevice] ?? DEVICE_DIMENSIONS.desktop;
    lastAutoScale = computeFitScale(stage, dims);
    const scale = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, zoomOverride ?? lastAutoScale),
    );
    applyScale(wrapper, iframe, dims, scale, currentDevice);
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  // ResizeObserver
  const resizeObserver = new ResizeObserver(() => rescale());
  resizeObserver.observe(stage);

  // Initial render
  updateDisplay();
  iframe.src = items[currentIndex].url;
  // Defer initial scale to next frame so stage has layout dimensions
  requestAnimationFrame(() => rescale());

  // ── Handle ──

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    resizeObserver.disconnect();
    document.removeEventListener("click", onDocClick);
    root.remove();
  }

  return {
    element: root,
    goTo,
    next: () => navigate(1),
    prev: () => navigate(-1),
    getIndex: () => currentIndex,
    setDevice(device: "desktop" | "mobile") {
      currentDevice = device;
      wrapper.dataset.device = device;
      deviceToggle?.setSelected(device);
      zoomOverride = null;
      rescale();
    },
    setColorScheme(scheme: "light" | "dark") {
      currentScheme = scheme;
      wrapper.dataset.colorScheme = scheme;
    },
    setZoom(zoom: number | null) {
      zoomOverride = zoom;
      rescale();
    },
    destroy,
  };
}
