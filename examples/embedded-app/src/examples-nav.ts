export type Tier = "start" | "patterns" | "reference";
export type Mode = "inline" | "launcher" | "fullscreen";

export type AdvancedExample = {
  slug: string;
  href: string;
  title: string;
  blurb: string;
  badge?: string;
  tier: Tier;
  tags: readonly string[];
  modes: readonly Mode[];
};

export const TIER_LABELS: Readonly<Record<Tier, string>> = {
  start: "Start here",
  patterns: "Patterns",
  reference: "Reference & debugging",
};

export const TIER_ORDER: readonly Tier[] = ["start", "patterns", "reference"];

export const ADVANCED_EXAMPLES: readonly AdvancedExample[] = [
  {
    slug: "dynamic-form",
    href: "/dynamic-form.html",
    title: "Dynamic Forms",
    blurb: "AI-generated forms via component middleware.",
    tier: "start",
    tags: ["forms", "interaction"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "artifact-demo",
    href: "/artifact-demo.html",
    title: "Artifact Sidebar",
    blurb: "Resizable split view for rich streaming content.",
    tier: "start",
    tags: ["layout", "content"],
    modes: ["inline"],
  },
  {
    slug: "voice-integration-demo",
    href: "/voice-integration-demo.html",
    title: "Voice Input & Output",
    blurb: "Speech-to-text and text-to-speech in the composer.",
    tier: "start",
    tags: ["voice", "audio"],
    modes: ["inline"],
  },
  {
    slug: "custom-voice-provider-demo",
    href: "/custom-voice-provider-demo.html",
    title: "Bring-Your-Own Voice",
    blurb: "Plug a custom speech provider in via provider.custom.",
    tier: "patterns",
    tags: ["voice", "audio", "integration"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "agent-demo",
    href: "/agent-demo.html",
    title: "Agent Loop",
    blurb: "Multi-turn reasoning with tool calls.",
    tier: "start",
    tags: ["agent", "tool-use", "streaming"],
    modes: ["inline", "launcher", "fullscreen"],
  },
  {
    slug: "approval-demo",
    href: "/approval-demo.html",
    title: "Tool Approval",
    blurb: "Human-in-the-loop confirmation before tool execution.",
    tier: "patterns",
    tags: ["agent", "tool-use", "interaction"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "action-middleware",
    href: "/action-middleware.html",
    title: "Tool Action Handlers",
    blurb: "Live DOM context with structured navigation and cart actions.",
    tier: "patterns",
    tags: ["agent", "tool-use", "integration"],
    modes: ["inline"],
  },
  {
    slug: "ask-user-question-demo",
    href: "/ask-user-question-demo.html",
    title: "Ask User Question & Suggested Replies",
    blurb: "Blocking answer sheets and fire-and-forget quick-reply chips.",
    tier: "patterns",
    tags: ["interaction", "forms"],
    modes: ["inline"],
  },
  {
    slug: "attachments-demo",
    href: "/attachments-demo.html",
    title: "File Attachments",
    blurb: "File and image uploads in the composer.",
    tier: "patterns",
    tags: ["attachments", "interaction"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "feedback-integration-demo",
    href: "/feedback-integration-demo.html",
    title: "Feedback Events",
    blurb: "Wire upvote, downvote, and copy events to your backend.",
    tier: "patterns",
    tags: ["feedback", "events"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "focus-input-demo",
    href: "/focus-input-demo.html",
    title: "Programmatic Input Focus",
    blurb: "Three APIs for controlling composer focus.",
    tier: "patterns",
    tags: ["interaction", "dev"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "tool-loading-demo",
    href: "/tool-loading-demo.html",
    title: "Tool & Reasoning Loaders",
    blurb: "Configurable indicators for tool calls and reasoning.",
    tier: "patterns",
    tags: ["streaming", "theming"],
    modes: ["inline"],
  },
  {
    slug: "stream-animations-demo",
    href: "/stream-animations-demo.html",
    title: "Text Reveal Effects",
    blurb: "Eight reveal animations for streaming assistant text.",
    tier: "patterns",
    tags: ["streaming", "theming"],
    modes: ["inline"],
  },
  {
    slug: "custom-loading-indicator",
    href: "/custom-loading-indicator.html",
    title: "Replace the Loader",
    blurb: "Swap in a custom loading animation.",
    tier: "patterns",
    tags: ["theming", "streaming"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "dynamic-form-fields",
    href: "/dynamic-form-fields.html",
    title: "Form Field Reference",
    blurb: "Every field type, width, helper text, and masking option.",
    tier: "reference",
    tags: ["forms", "dev"],
    modes: ["inline"],
  },
  {
    slug: "event-stream-testing",
    href: "/event-stream-testing.html",
    title: "Event Inspector",
    blurb: "Inspect controller events and exercise the event-stream API.",
    tier: "reference",
    tags: ["events", "dev"],
    modes: ["inline", "launcher"],
  },
  {
    slug: "smart-dom-reader-demo",
    href: "/smart-dom-reader-demo.html",
    title: "Shadow-aware Page Context",
    blurb: "Launcher reads a live shop, piercing shadow-DOM products the default reader misses.",
    tier: "reference",
    tags: ["context", "dev"],
    modes: ["launcher"],
  },
];

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );

/**
 * Find the registry entry for a given slug. Useful when a demo wants to read
 * its own title/blurb/badge for the title strip.
 */
export function getExample(slug: string): AdvancedExample | undefined {
  return ADVANCED_EXAMPLES.find((e) => e.slug === slug);
}

/** 1-based position of an example in the gallery, or -1. */
export function getExampleIndex(slug: string): number {
  return ADVANCED_EXAMPLES.findIndex((e) => e.slug === slug);
}

/** Zero-padded "NN/TT" counter, e.g. "03/15". */
export function formatExampleIndex(index: number): string {
  const total = ADVANCED_EXAMPLES.length;
  return `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
}

/**
 * Mount the persistent top app bar with brand + demo picker + prev/next.
 * Idempotent — safe to call multiple times.
 *
 * Visual contract: a fixed 56px bar at the top of the viewport. Body padding
 * for the bar is reserved by demo-shared.css so first paint already accounts
 * for it (no jump when this runs).
 */
export function renderExamplesShell(currentSlug?: string): void {
  const items = ADVANCED_EXAMPLES;
  const currentIndex = currentSlug
    ? items.findIndex((e) => e.slug === currentSlug)
    : -1;
  const current = currentIndex >= 0 ? items[currentIndex] : null;
  const prev = currentIndex > 0 ? items[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < items.length - 1
      ? items[currentIndex + 1]
      : null;

  document.querySelector(".shell-header")?.remove();

  const pickerLabel = current ? current.title : "All examples";
  const pickerBadge = current?.badge
    ? `<span class="nav-badge">${escapeHtml(current.badge)}</span>`
    : "";
  const renderItem = (entry: AdvancedExample): string => {
    const isCurrent = entry.slug === currentSlug;
    const badge = entry.badge
      ? `<span class="nav-badge">${escapeHtml(entry.badge)}</span>`
      : "";
    const index = formatExampleIndex(items.indexOf(entry));
    return `<li class="shell-picker-item${isCurrent ? " is-current" : ""}">
      <a href="${entry.href}" title="${escapeHtml(entry.blurb)}">
        <span class="shell-picker-item-title"><span class="shell-picker-item-index">${index}</span>${escapeHtml(entry.title)}${badge}</span>
        <span class="shell-picker-item-blurb">${escapeHtml(entry.blurb)}</span>
      </a>
    </li>`;
  };

  const sections = TIER_ORDER.map((tier) => {
    const entries = items.filter((e) => e.tier === tier);
    if (entries.length === 0) return "";
    return `<li class="shell-picker-section">
      <span class="shell-picker-section-heading">${escapeHtml(TIER_LABELS[tier])}</span>
      <ul class="shell-picker-section-list">${entries.map(renderItem).join("")}</ul>
    </li>`;
  }).join("");

  const prevNext = current
    ? `<div class="shell-prevnext">
        ${
          prev
            ? `<a href="${prev.href}" class="shell-prevnext-link" title="${escapeHtml(prev.title)}"><span aria-hidden="true">←</span><span class="shell-prevnext-text">${escapeHtml(prev.title)}</span></a>`
            : `<span class="shell-prevnext-link is-disabled"><span aria-hidden="true">←</span><span class="shell-prevnext-text">Prev</span></span>`
        }
        ${
          next
            ? `<a href="${next.href}" class="shell-prevnext-link" title="${escapeHtml(next.title)}"><span class="shell-prevnext-text">${escapeHtml(next.title)}</span><span aria-hidden="true">→</span></a>`
            : `<span class="shell-prevnext-link is-disabled"><span class="shell-prevnext-text">Next</span><span aria-hidden="true">→</span></span>`
        }
      </div>`
    : "";

  const header = document.createElement("nav");
  header.className = "shell-header";
  header.innerHTML = `
    <a class="shell-brand" href="/">Persona</a>
    <span class="shell-sep" aria-hidden="true">/</span>
    <a class="shell-crumb" href="/advanced.html">Advanced Examples</a>
    <span class="shell-sep" aria-hidden="true">/</span>
    <div class="shell-picker">
      <button type="button" class="shell-picker-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="shell-picker-label">${escapeHtml(pickerLabel)}${pickerBadge}</span>
        <svg class="shell-picker-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="M2.3 4.3a1 1 0 0 1 1.4 0L6 6.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 0-1.4z"/></svg>
        <kbd class="shell-kbd" aria-hidden="true">⌘K</kbd>
      </button>
      <div class="shell-picker-menu" role="listbox" hidden>
        <a class="shell-picker-all" href="/advanced.html">▸ All examples</a>
        <ul class="shell-picker-list">${sections}</ul>
      </div>
    </div>
    ${prevNext}
  `;

  document.body.insertBefore(header, document.body.firstChild);
  // Fade the header in instead of popping it in. This runs in a deferred
  // module (after first paint), so paint it at opacity 0 once, then flip the
  // ready flag on the next frame to trigger the CSS transition.
  requestAnimationFrame(() => header.setAttribute("data-shell-ready", ""));

  // Picker dropdown wiring
  const trigger = header.querySelector<HTMLButtonElement>(
    ".shell-picker-trigger",
  );
  const menu = header.querySelector<HTMLDivElement>(".shell-picker-menu");
  if (!trigger || !menu) return;

  const setOpen = (open: boolean) => {
    if (open) {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      const active = menu.querySelector<HTMLAnchorElement>(
        ".shell-picker-item.is-current a",
      );
      (active ?? menu.querySelector<HTMLAnchorElement>("a"))?.focus({
        preventScroll: true,
      });
    } else {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  document.addEventListener("click", (e) => {
    if (menu.hidden) return;
    if (!header.contains(e.target as Node)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      trigger.focus();
      return;
    }
    // ⌘K / Ctrl+K opens the example picker (spec-sheet jump-to).
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      setOpen(menu.hidden);
    }
  });
}
