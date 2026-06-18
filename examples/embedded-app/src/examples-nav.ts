import "./command-palette.css";

import {
  createPersonaCommandItems,
  installCommandPalette,
  type CommandPaletteItem,
} from "./command-palette";
import { STANDALONE_EXAMPLES } from "./standalone-nav";

export type Tier = "start" | "patterns" | "reference";
export type Mode = "inline" | "launcher";

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
    slug: "dynamic-components",
    href: "/dynamic-components.html",
    title: "Dynamic Components",
    blurb: "Stream interactive forms, cards, charts, and badges from JSON directives.",
    tier: "start",
    tags: ["components", "forms", "interaction"],
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
    slug: "server-tts-demo",
    href: "/server-tts-demo.html",
    title: "Server TTS (streaming)",
    blurb: "Read aloud with hosted voices via a streaming SpeechEngine.",
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
    modes: ["inline", "launcher"],
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

function normalizeCodeBlockHtml(html: string): string {
  const lines = html.replace(/\r\n?/g, "\n").split("\n");

  while (lines[0]?.trim() === "") lines.shift();
  while (lines[lines.length - 1]?.trim() === "") lines.pop();

  const commonIndent = Math.min(
    ...lines
      .filter((line) => line.trim().length > 0)
      .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0),
  );

  if (!Number.isFinite(commonIndent) || commonIndent <= 0) {
    return lines.join("\n");
  }

  return lines
    .map((line) => {
      const lineIndent = line.match(/^[ \t]*/)?.[0].length ?? 0;
      return line.slice(Math.min(commonIndent, lineIndent));
    })
    .join("\n");
}

function normalizeDemoCodeBlocks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(".code-block").forEach((block) => {
    if (block.dataset.codeBlockNormalized === "true") return;
    block.innerHTML = normalizeCodeBlockHtml(block.innerHTML);
    block.dataset.codeBlockNormalized = "true";
  });
}

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

export type ExamplesShellOptions = {
  onCommandSelect?: (href: string, item: CommandPaletteItem) => void;
};

/**
 * Mount the persistent top app bar with brand + demo picker + prev/next.
 * Idempotent: safe to call multiple times.
 *
 * Visual contract: a fixed 56px bar at the top of the viewport. Body padding
 * for the bar is reserved by demo-shared.css so first paint already accounts
 * for it (no jump when this runs).
 */
export function renderExamplesShell(
  currentSlug?: string,
  options: ExamplesShellOptions = {},
): void {
  normalizeDemoCodeBlocks();

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
      <button type="button" class="shell-picker-trigger" aria-haspopup="dialog" aria-label="Search Persona examples">
        <span class="shell-picker-label">${escapeHtml(pickerLabel)}${pickerBadge}</span>
        <kbd class="shell-kbd" aria-hidden="true">⌘K</kbd>
      </button>
    </div>
    ${prevNext}
  `;

  document.body.insertBefore(header, document.body.firstChild);
  // Fade the header in instead of popping it in. This runs in a deferred
  // module (after first paint), so paint it at opacity 0 once, then flip the
  // ready flag on the next frame to trigger the CSS transition.
  requestAnimationFrame(() => header.setAttribute("data-shell-ready", ""));

  const trigger = header.querySelector<HTMLButtonElement>(
    ".shell-picker-trigger",
  );
  const commandItems = createPersonaCommandItems({
    advancedExamples: items,
    standaloneExamples: STANDALONE_EXAMPLES,
    currentPath: current?.href,
  });

  installCommandPalette({
    trigger,
    items: commandItems,
    title: "Search Persona",
    subtitle: "Jump between Persona pages, demos, and examples.",
    placeholder: "Search examples, pages, or topics...",
    onCommandSelect: options.onCommandSelect,
  });
}
