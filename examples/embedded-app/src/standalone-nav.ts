import "./command-palette.css";

import {
  createPersonaCommandItems,
  installCommandPalette,
} from "./command-palette";

export type StandaloneExample = {
  slug: string;
  href: string;
  title: string;
  blurb: string;
};

export const STANDALONE_EXAMPLES: readonly StandaloneExample[] = [
  {
    slug: "sample",
    href: "/standalone/sample.html",
    title: "Sample",
    blurb: "Minimal launcher install with shopping-action handlers",
  },
  {
    slug: "shopify",
    href: "/standalone/shopify.html",
    title: "Shopify",
    blurb: "Shopify-style storefront install",
  },
  {
    slug: "example-shop",
    href: "/standalone/example-shop.html",
    title: "Example Shop",
    blurb: "Standalone widget demo on a faux shop page",
  },
  {
    slug: "example-shop-metadata",
    href: "/standalone/example-shop-metadata.html",
    title: "Shop · Metadata",
    blurb: "Example shop with persistent metadata wired in",
  },
  {
    slug: "example-shop-installer",
    href: "/standalone/example-shop-installer.html",
    title: "Shop · Installer",
    blurb: "Installer-script version of the example shop",
  },
  {
    slug: "example-shop-installer-voice-metadata",
    href: "/standalone/example-shop-installer-voice-metadata.html",
    title: "Shop · Installer + Voice + Metadata",
    blurb: "Installer with voice and metadata enabled",
  },
  {
    slug: "preview-mode",
    href: "/standalone/preview-mode.html",
    title: "Preview Mode",
    blurb: "Gate widget load behind a URL preview parameter",
  },
  {
    slug: "lifecycle-events",
    href: "/standalone/lifecycle-events.html",
    title: "Lifecycle Events",
    blurb: "Deferred launcher + onScriptLoad/onLauncherShown/onChatReady events",
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

const STYLE_ID = "standalone-nav-style";
const STYLES = `
  body { margin-top: 44px !important; }
  .standalone-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: saturate(140%) blur(8px);
    -webkit-backdrop-filter: saturate(140%) blur(8px);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #1f2937;
    z-index: 9999;
    overflow-x: auto;
    white-space: nowrap;
  }
  .standalone-nav::-webkit-scrollbar { display: none; }
  .standalone-nav-home {
    color: #4b5563;
    text-decoration: none;
    font-weight: 500;
    flex: none;
    padding: 4px 8px;
    border-radius: 6px;
  }
  .standalone-nav-home:hover { background: rgba(0, 0, 0, 0.05); }
  .standalone-nav-divider {
    width: 1px;
    height: 18px;
    background: rgba(0, 0, 0, 0.1);
    flex: none;
  }
  .standalone-nav-label {
    color: #6b7280;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex: none;
  }
  .standalone-nav-list {
    display: flex;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .standalone-nav-list a {
    color: #374151;
    text-decoration: none;
    padding: 4px 10px;
    border-radius: 6px;
    display: inline-block;
  }
  .standalone-nav-list a:hover { background: rgba(0, 0, 0, 0.05); }
  .standalone-nav-list .is-current a {
    background: #1f2937;
    color: #ffffff;
  }
  .standalone-nav-command {
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.72);
    color: #374151;
    border-radius: 6px;
    padding: 4px 9px;
    font: inherit;
    cursor: pointer;
    flex: none;
  }
  .standalone-nav-command:hover { background: rgba(0, 0, 0, 0.05); }
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * Mount a slim persistent top bar with cross-links to every standalone page
 * and a "Home" link back to the examples landing. Idempotent.
 */
export function renderStandaloneNav(currentSlug?: string): void {
  injectStyles();

  const existing = document.querySelector(".standalone-nav");
  if (existing) existing.remove();

  const items = STANDALONE_EXAMPLES.map((entry) => {
    const isCurrent = entry.slug === currentSlug;
    return `<li class="${isCurrent ? "is-current" : ""}">
      <a href="${entry.href}" title="${escapeHtml(entry.blurb)}">${escapeHtml(entry.title)}</a>
    </li>`;
  }).join("");

  const nav = document.createElement("nav");
  nav.className = "standalone-nav";
  nav.innerHTML = `
    <a class="standalone-nav-home" href="/">← Home</a>
    <span class="standalone-nav-divider"></span>
    <span class="standalone-nav-label">Standalone</span>
    <button type="button" class="standalone-nav-command" aria-label="Search Persona pages">⌘K</button>
    <ul class="standalone-nav-list">${items}</ul>
  `;

  document.body.insertBefore(nav, document.body.firstChild);

  installCommandPalette({
    trigger: nav.querySelector<HTMLElement>(".standalone-nav-command"),
    items: createPersonaCommandItems({
      standaloneExamples: STANDALONE_EXAMPLES,
      currentPath: STANDALONE_EXAMPLES.find((entry) => entry.slug === currentSlug)?.href,
    }),
  });
}
