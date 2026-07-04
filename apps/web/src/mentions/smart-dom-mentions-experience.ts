/**
 * A shareable "context mentions" experience.
 *
 * This is a self-contained factory that returns an `AgentWidgetContextMentionConfig`:
 * a smart-dom page source (with `mapItem` reshaping) plus custom menu-row and chip
 * renderers with source-aware hover. It depends ONLY on `@runtypelabs/persona` and
 * its `/smart-dom-reader` entry, so you can copy this file into any project (or
 * publish it as its own package) and wire it in one line:
 *
 * ```ts
 * import { createSmartDomMentionsExperience } from "./smart-dom-mentions-experience";
 *
 * initAgentWidget({
 *   contextMentions: createSmartDomMentionsExperience({
 *     root: document.querySelector(".content"),
 *     extraSources: [myFilesSource],
 *   }),
 * });
 * ```
 *
 * This is the idiomatic way to share a mentions setup today: the widget's plugin
 * registry is render-only (message bubbles, launcher, composer, …) and cannot
 * carry mention sources or config, so a config factory is the shareable unit.
 */
import {
  renderLucideIcon,
  type AgentWidgetContextMentionConfig,
  type AgentWidgetContextMentionItem,
  type AgentWidgetContextMentionSource,
  type EnrichedPageElement,
} from "@runtypelabs/persona";
import { createSmartDomMentionSource } from "@runtypelabs/persona/smart-dom-reader";

export interface SmartDomMentionsExperienceOptions {
  /** Scope smart-dom extraction to a subtree. Default: the whole document. */
  root?: HTMLElement;
  /** Extraction mode. Default: "full" (interactive + semantic content). */
  mode?: "interactive" | "full";
  /** Id for the built-in page source. Default: "page". */
  pageSourceId?: string;
  /** Group header for the page source. Default: "Page". */
  pageSourceLabel?: string;
  /** Extra sources (e.g. files, docs) shown above the Page group. */
  extraSources?: AgentWidgetContextMentionSource[];
  /** Optional logger for hover/highlight events. Default: no-op. */
  log?: (message: string) => void;
  /** Accent color for the hover outline. Default: "#6366f1". */
  accent?: string;
  /** Include the smart-dom page source. Set false for extra-sources only. Default: true. */
  includePageSource?: boolean;
  /** Use the custom menu-row renderer (badges + match highlight). Set false for the built-in row. Default: true. */
  customRows?: boolean;
  /** Use the custom chip renderer (source-aware hover). Set false for the built-in chip. Default: true. */
  customChips?: boolean;
  /**
   * Chip hover behavior (when `customChips`):
   *  - `"default"`: Page chips outline the live element; other chips get a `title` tooltip.
   *  - `"popover"`: all chips show a body-anchored popover previewing the resolved content
   *    (select-resolved sources use `ctx.payload`; the page source re-reads the live element).
   * @default "default"
   */
  chipHover?: "default" | "popover";
}

/**
 * Build a ready-to-spread `contextMentions` config: the smart-dom page source
 * plus the custom row/chip renderers. Spread it and add your own page-specific
 * callbacks if you like:
 *
 * ```ts
 * contextMentions: {
 *   ...createSmartDomMentionsExperience({ root }),
 *   onMentionResolveError: (item, err) => toast(`${item.label} failed`),
 * }
 * ```
 */
export function createSmartDomMentionsExperience(
  opts: SmartDomMentionsExperienceOptions = {},
): AgentWidgetContextMentionConfig {
  const log = opts.log ?? (() => {});
  const accent = opts.accent ?? "#6366f1";
  const pageSourceId = opts.pageSourceId ?? "page";
  const includePageSource = opts.includePageSource !== false;
  const customRows = opts.customRows !== false;
  const customChips = opts.customChips !== false;
  const chipHover = opts.chipHover ?? "default";

  // --- Hover highlight: re-read the live element by its selector ---------------
  // Page items are `resolveOn:"submit"`, so their text isn't resolved while the
  // chip sits in the composer. But `ref.itemId` IS the CSS selector, so a hovered
  // Page chip can highlight the live element on the page with zero extra API.
  let highlighted: { el: HTMLElement; prevOutline: string } | null = null;
  const clearHighlight = (): void => {
    if (!highlighted) return;
    highlighted.el.style.outline = highlighted.prevOutline;
    highlighted = null;
  };
  const highlightPageElement = (selector: string): void => {
    clearHighlight();
    let el: HTMLElement | null = null;
    try {
      el = document.querySelector<HTMLElement>(selector);
    } catch {
      el = null;
    }
    if (!el) {
      log(`Hover: no live element for ${selector}`);
      return;
    }
    highlighted = { el, prevOutline: el.style.outline };
    el.style.outline = `2px solid ${accent}`;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    log(`Hover highlight → ${selector}`);
  };

  // Scroll to a live element and flash a brief outline (click-to-navigate).
  // A single active flash is tracked so a rapid re-click cancels the pending
  // restore first — otherwise the second click would capture the flash outline
  // as its "previous" value and leave the outline stuck on.
  let activeFlash: { restore: () => void; timer: number } | null = null;
  const flashPageElement = (selector: string): void => {
    let found: HTMLElement | null = null;
    try {
      found = document.querySelector<HTMLElement>(selector);
    } catch {
      found = null;
    }
    if (!found) {
      log(`Navigate: no live element for ${selector}`);
      return;
    }
    if (activeFlash) {
      window.clearTimeout(activeFlash.timer);
      activeFlash.restore();
      activeFlash = null;
    }
    const target = found;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    const prevOutline = target.style.outline;
    const prevOffset = target.style.outlineOffset;
    const restore = () => {
      target.style.outline = prevOutline;
      target.style.outlineOffset = prevOffset;
    };
    target.style.outline = `2px solid ${accent}`;
    target.style.outlineOffset = "2px";
    const timer = window.setTimeout(() => {
      restore();
      activeFlash = null;
    }, 1200);
    activeFlash = { restore, timer };
    log(`Navigate → ${selector}`);
  };

  const firstLine = (text: string): string => {
    const line = text.split("\n").find((l) => l.trim()) ?? text;
    return line.length > 100 ? `${line.slice(0, 99)}…` : line;
  };

  // --- Chip hover popover: a body-anchored preview -----------------------------
  // Anchored to <body> (not the chip) so it can't be clipped by the composer's
  // overflow. One shared node is reused across mounts via the data attribute.
  const ensurePreviewPopover = (): HTMLElement => {
    const existing = document.querySelector<HTMLElement>(
      "[data-persona-mention-preview]",
    );
    if (existing) return existing;
    const el = document.createElement("div");
    el.setAttribute("data-persona-mention-preview", "");
    // Theme-aware: reads off the widget's surface/text/border tokens so the
    // preview adapts to light and dark themes (falls back to a dark tooltip).
    el.style.cssText =
      "position:fixed;z-index:2147483000;display:none;max-width:300px;max-height:180px;" +
      "overflow:auto;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.45;" +
      "white-space:pre-wrap;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.28);" +
      "background:var(--persona-surface,#111827);color:var(--persona-text,#f9fafb);" +
      "border:1px solid var(--persona-border,rgba(255,255,255,.08));";
    document.body.appendChild(el);
    return el;
  };
  const showChipPreview = (anchor: HTMLElement, text: string): void => {
    const el = ensurePreviewPopover();
    el.textContent = text.length > 700 ? `${text.slice(0, 699)}…` : text;
    el.style.display = "block";
    const r = anchor.getBoundingClientRect();
    const above = r.top - el.offsetHeight - 8;
    el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${above < 8 ? r.bottom + 8 : above}px`;
  };
  const hideChipPreview = (): void => {
    const el = document.querySelector<HTMLElement>("[data-persona-mention-preview]");
    if (el) el.style.display = "none";
  };

  // --- Custom menu row: source badge + highlighted query match ----------------
  const labelWithMatch = (label: string, query: string): HTMLElement => {
    const span = document.createElement("span");
    span.className = "persona-mention-option-label";
    const q = query.trim().toLowerCase();
    const idx = q ? label.toLowerCase().indexOf(q) : -1;
    if (idx === -1) {
      span.textContent = label;
      return span;
    }
    const strong = document.createElement("strong");
    strong.textContent = label.slice(idx, idx + q.length);
    span.append(
      document.createTextNode(label.slice(0, idx)),
      strong,
      document.createTextNode(label.slice(idx + q.length)),
    );
    return span;
  };

  const pageSource = createSmartDomMentionSource({
    id: pageSourceId,
    label: opts.pageSourceLabel ?? "Page",
    mode: opts.mode ?? "full",
    ...(opts.root ? { root: opts.root } : {}),
    // `mapItem` reshapes each surfaced element without rewriting the source:
    // friendlier descriptions and a ranking boost so clickable controls float up.
    mapItem: (el: EnrichedPageElement, defaultItem: AgentWidgetContextMentionItem) => ({
      ...defaultItem,
      description:
        el.interactivity === "clickable"
          ? "button on this page"
          : el.interactivity === "input"
            ? "input field"
            : el.interactivity === "navigable"
              ? "link on this page"
              : defaultItem.description,
      recencyScore: el.interactivity === "clickable" ? 1 : 0,
    }),
  });

  const config: AgentWidgetContextMentionConfig = {
    enabled: true,
    sources: includePageSource
      ? [...(opts.extraSources ?? []), pageSource]
      : [...(opts.extraSources ?? [])],
  };

  if (customRows) {
    // NARROW per-row override: the widget keeps the option wrapper + keyboard
    // nav; we supply the inner visuals (icon, matched label, a source badge).
    config.renderMentionItem = (ctx) => {
      const row = document.createElement("span");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;width:100%;min-width:0;";

      const iconHost = document.createElement("span");
      iconHost.className = "persona-mention-option-icon";
      const icon = renderLucideIcon(
        ctx.item.iconName ?? "at-sign",
        15,
        "currentColor",
        2,
      );
      if (icon) iconHost.appendChild(icon);

      const text = document.createElement("span");
      text.style.cssText =
        "display:flex;flex-direction:column;flex:1;min-width:0;";
      text.appendChild(labelWithMatch(ctx.item.label, ctx.query));
      if (ctx.item.description) {
        const desc = document.createElement("span");
        desc.className = "persona-mention-option-desc";
        desc.textContent = ctx.item.description;
        text.appendChild(desc);
      }

      const badge = document.createElement("span");
      badge.textContent = ctx.source.label.toLowerCase();
      // Theme-aware chip: a neutral container fill + accent text reads on both
      // light and dark (a fixed 12%-indigo fill washes out on dark themes).
      badge.style.cssText =
        "flex:none;font-size:10px;letter-spacing:.04em;padding:1px 7px;border-radius:999px;" +
        `background:var(--persona-container,rgba(99,102,241,.12));color:var(--persona-accent,${accent});`;

      row.append(iconHost, text, badge);
      return row;
    };
  }

  if (customChips) {
    // MID-LEVEL chip override: same native pill look, but hover behavior we own.
    // Page chips highlight the live element (re-read via ref.itemId); other
    // (select-resolved) chips preview their fetched content from ctx.payload.
    config.renderMentionChip = (ctx) => {
      const chip = document.createElement("span");
      chip.className = "persona-mention-chip";
      chip.setAttribute("data-status", ctx.status);

      const dot = document.createElement("span");
      const color =
        ctx.status === "error"
          ? "#e5484d"
          : ctx.status === "ready"
            ? "#30a46c"
            : "#9ca3af";
      dot.style.cssText = `flex:none;width:6px;height:6px;border-radius:999px;background:${color};`;

      const label = document.createElement("span");
      label.className = "persona-mention-chip-label";
      label.textContent = ctx.ref.label;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "persona-mention-chip-remove";
      remove.setAttribute("aria-label", `Remove ${ctx.ref.label} context`);
      const x = renderLucideIcon("x", 11, "currentColor", 2.5);
      if (x) remove.appendChild(x);
      else remove.textContent = "×";
      remove.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearHighlight();
        hideChipPreview();
        ctx.remove();
      });

      chip.append(dot, label, remove);

      if (chipHover === "popover") {
        // Show a body-anchored popover previewing the resolved content. The page
        // source is submit-resolved (no payload yet), so re-read the live element.
        chip.addEventListener("mouseenter", () => {
          let text: string | null = null;
          if (ctx.ref.sourceId === pageSourceId) {
            try {
              text =
                document.querySelector(ctx.ref.itemId)?.textContent?.trim() ||
                null;
            } catch {
              text = null;
            }
          } else {
            text = ctx.payload?.llmAppend?.trim() || null;
          }
          if (text) {
            showChipPreview(chip, text);
            log(`Preview popover (${ctx.ref.label})`);
          }
        });
        chip.addEventListener("mouseleave", hideChipPreview);
        // Click a Page chip (not the ×) to scroll to + flash its live element.
        // Page mentions carry the CSS selector as `ref.itemId`; other sources
        // have no page location, so they stay non-navigable.
        if (ctx.ref.sourceId === pageSourceId) {
          chip.style.cursor = "pointer";
          chip.title = "Click to scroll to this element";
          chip.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).closest(".persona-mention-chip-remove"))
              return;
            hideChipPreview();
            flashPageElement(ctx.ref.itemId);
          });
        }
      } else if (ctx.ref.sourceId === pageSourceId) {
        chip.addEventListener("mouseenter", () =>
          highlightPageElement(ctx.ref.itemId),
        );
        chip.addEventListener("mouseleave", clearHighlight);
      } else {
        // Select-resolved: the payload is already here, so preview it.
        const preview = ctx.payload?.llmAppend?.trim();
        if (preview) chip.title = firstLine(preview);
        chip.addEventListener("mouseenter", () => {
          if (ctx.payload?.llmAppend)
            log(`Hover preview (${ctx.ref.label}): ${firstLine(ctx.payload.llmAppend)}`);
        });
      }

      return chip;
    };
  }

  return config;
}
