export type CommandPaletteItem = {
  id: string;
  title: string;
  href: string;
  section: string;
  subtitle?: string;
  keywords?: readonly string[];
  current?: boolean;
};

export type CommandPaletteExample = {
  slug: string;
  href: string;
  title: string;
  blurb: string;
  tags?: readonly string[];
};

export type CommandPaletteOptions = {
  id?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  items: readonly CommandPaletteItem[];
  trigger?: HTMLElement | null;
  onCommandSelect?: (href: string, item: CommandPaletteItem) => void;
};

export type PersonaCommandItemsOptions = {
  advancedExamples?: readonly CommandPaletteExample[];
  standaloneExamples?: readonly CommandPaletteExample[];
  currentPath?: string;
  includeHomeSections?: boolean;
};

type CommandPaletteController = {
  open: () => void;
  close: () => void;
  destroy: () => void;
};

type CommandPaletteState = {
  root: HTMLElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
  empty: HTMLElement;
  options: CommandPaletteOptions;
  activeIndex: number;
  visibleItems: CommandPaletteItem[];
  lastFocus: HTMLElement | null;
  triggerListeners: WeakSet<HTMLElement>;
  documentKeydown: (event: KeyboardEvent) => void;
  rootClick: (event: MouseEvent) => void;
  inputKeydown: (event: KeyboardEvent) => void;
  inputListener: () => void;
  listClick: (event: MouseEvent) => void;
};

const DEFAULT_TITLE = "Search Persona";
const DEFAULT_SUBTITLE = "Jump to docs, demos, and integration recipes.";
const DEFAULT_PLACEHOLDER = "Search demos, pages, or topics...";

const FEATURED_DEMOS: readonly CommandPaletteItem[] = [
  {
    id: "featured:webmcp-storefront",
    title: "WebMCP Storefront",
    href: "/webmcp-demo.html",
    section: "Featured demos",
    subtitle: "Expose page tools to the agent via WebMCP.",
    keywords: ["store", "shop", "tools", "cart", "webmcp"],
  },
  {
    id: "featured:webmcp-calendar",
    title: "WebMCP Calendar",
    href: "/webmcp-calendar.html",
    section: "Featured demos",
    subtitle: "Read availability and book meetings with page tools.",
    keywords: ["calendar", "booking", "schedule", "webmcp"],
  },
  {
    id: "featured:webmcp-slides",
    title: "WebMCP Slides",
    href: "/webmcp-slides.html",
    section: "Featured demos",
    subtitle: "Let the agent edit a slide deck in the browser.",
    keywords: ["slides", "deck", "presentation", "webmcp"],
  },
  {
    id: "featured:litert-slides",
    title: "On-device Slides (Gemma 4)",
    href: "/litert-slides.html",
    section: "Featured demos",
    subtitle: "The slide editor driven by Gemma 4 running in-browser via LiteRT-LM.",
    keywords: ["litert", "gemma", "on-device", "webgpu", "local", "slides", "webmcp"],
  },
  {
    id: "featured:webmcp-paint",
    title: "WebMCP Paint",
    href: "/webmcp-paint.html",
    section: "Featured demos",
    subtitle: "Drive an embedded paint canvas through WebMCP.",
    keywords: ["paint", "canvas", "image", "webmcp"],
  },
  {
    id: "featured:bakery",
    title: "Bakery Assistant",
    href: "/bakery.html",
    section: "Featured demos",
    subtitle: "A polished retail assistant with catalog and cart actions.",
    keywords: ["bakery", "retail", "cart", "commerce"],
  },
  {
    id: "featured:docked-panel",
    title: "Docked Panel",
    href: "/docked-panel-demo.html",
    section: "Featured demos",
    subtitle: "A dashboard copilot docked to the side of the page.",
    keywords: ["docked", "dashboard", "layout", "webmcp"],
  },
  {
    id: "featured:fullscreen",
    title: "Fullscreen Assistant",
    href: "/fullscreen-assistant-demo.html",
    section: "Featured demos",
    subtitle: "Full-viewport assistant layout with artifacts.",
    keywords: ["fullscreen", "layout", "artifact"],
  },
  {
    id: "featured:persistent-composer",
    title: "Persistent Composer",
    href: "/persistent-composer.html",
    section: "Featured demos",
    subtitle: "Always-visible composer bar layout.",
    keywords: ["composer", "input", "layout"],
  },
  {
    id: "featured:launcher",
    title: "Launcher Demo",
    href: "/launcher-demo.html",
    section: "Featured demos",
    subtitle: "Floating launcher sizing, positioning, and handoff behavior.",
    keywords: ["launcher", "floating", "deferred"],
  },
];

const SITE_COMMANDS: readonly CommandPaletteItem[] = [
  {
    id: "site:home",
    title: "Persona Home",
    href: "/",
    section: "This site",
    subtitle: "The Persona product homepage.",
    keywords: ["home", "overview", "landing"],
  },
  {
    id: "site:advanced",
    title: "Browse All Examples",
    href: "/advanced.html",
    section: "This site",
    subtitle: "The full examples gallery.",
    keywords: ["examples", "gallery", "demos"],
  },
  {
    id: "site:theme",
    title: "Theme Editor",
    href: "/theme.html",
    section: "This site",
    subtitle: "Visually customize widget tokens and components.",
    keywords: ["theme", "tokens", "style", "customize"],
  },
  {
    id: "site:standalone",
    title: "Standalone Script Samples",
    href: "/standalone/sample.html",
    section: "This site",
    subtitle: "Copy-paste CDN and installer examples.",
    keywords: ["standalone", "cdn", "installer", "script"],
  },
];

const HOME_SECTION_COMMANDS: readonly CommandPaletteItem[] = [
  {
    id: "home:quick-start",
    title: "Quick Start",
    href: "/#quick-start",
    section: "Home sections",
    subtitle: "Install Persona with Runtype or any SSE backend.",
    keywords: ["install", "setup", "start", "cli"],
  },
  {
    id: "home:webmcp",
    title: "WebMCP Overview",
    href: "/#webmcp",
    section: "Home sections",
    subtitle: "See how page tools connect to Persona.",
    keywords: ["tools", "webmcp", "agent"],
  },
  {
    id: "home:demos",
    title: "Demos & Patterns",
    href: "/#demos",
    section: "Home sections",
    subtitle: "Jump to the homepage demo grid.",
    keywords: ["patterns", "examples", "gallery"],
  },
  {
    id: "home:try-it",
    title: "Try the Docs Agent",
    href: "/#try-it",
    section: "Home sections",
    subtitle: "Open the live Persona rail on the homepage.",
    keywords: ["chat", "assistant", "docs", "try"],
  },
];

let state: CommandPaletteState | null = null;

const normalizePath = (href: string): string => {
  try {
    const url = new URL(href, window.location.origin);
    return url.pathname === "/index.html" ? "/" : url.pathname;
  } catch {
    const [path] = href.split("#");
    return path === "/index.html" ? "/" : path || "/";
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

function scoreItem(item: CommandPaletteItem, terms: readonly string[]): number {
  const title = item.title.toLowerCase();
  const subtitle = item.subtitle?.toLowerCase() ?? "";
  const section = item.section.toLowerCase();
  const keywords = (item.keywords ?? []).map((keyword) => keyword.toLowerCase());
  let score = item.current ? 8 : 0;

  for (const term of terms) {
    if (title === term) score += 80;
    if (title.startsWith(term)) score += 45;
    if (title.includes(term)) score += 30;
    if (section.includes(term)) score += 12;
    if (subtitle.includes(term)) score += 8;
    for (const keyword of keywords) {
      if (keyword === term) score += 18;
      else if (keyword.includes(term)) score += 10;
    }
  }

  return score;
}

export function searchCommandPaletteItems(
  items: readonly CommandPaletteItem[],
  query: string,
): CommandPaletteItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];

  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function createPersonaCommandItems(
  options: PersonaCommandItemsOptions = {},
): CommandPaletteItem[] {
  const currentPath = normalizePath(options.currentPath ?? window.location.pathname);
  const items: CommandPaletteItem[] = [
    ...SITE_COMMANDS,
    ...(options.includeHomeSections ? HOME_SECTION_COMMANDS : []),
    ...FEATURED_DEMOS,
    ...(options.advancedExamples ?? []).map((entry) => ({
      id: `advanced:${entry.slug}`,
      title: entry.title,
      href: entry.href,
      section: "Advanced examples",
      subtitle: entry.blurb,
      keywords: [entry.slug, ...(entry.tags ?? [])],
      current: false,
    })),
    ...(options.standaloneExamples ?? []).map((entry) => ({
      id: `standalone:${entry.slug}`,
      title: entry.title,
      href: entry.href,
      section: "Standalone samples",
      subtitle: entry.blurb,
      keywords: [entry.slug, "standalone", "script", "installer"],
    })),
  ];

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = normalizePath(item.href);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      ...item,
      current: normalizePath(item.href) === currentPath,
    }));
}

function createRoot(options: CommandPaletteOptions): CommandPaletteState {
  const root = document.createElement("div");
  root.className = "persona-command-palette";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "persona-command-palette-title");
  root.setAttribute("data-persona-command-palette-root", "");

  root.innerHTML = `
    <div class="persona-command-palette-backdrop" data-command-palette-close></div>
    <div class="persona-command-palette-panel">
      <div class="persona-command-palette-titlebar">
        <div class="persona-command-palette-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span class="persona-command-palette-titlebar-label">Persona command palette</span>
        <button type="button" class="persona-command-palette-close" data-command-palette-close>esc</button>
      </div>
      <div class="persona-command-palette-search">
        <svg class="persona-command-palette-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6Z" stroke="currentColor" stroke-width="1.8"/>
          <path d="m16.1 16.1 4.4 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <input type="search" autocomplete="off" spellcheck="false" />
      </div>
      <div class="persona-command-palette-meta">
        <div>
          <h2 id="persona-command-palette-title"></h2>
          <p></p>
        </div>
        <span>⌘K</span>
      </div>
      <div class="persona-command-palette-results" role="listbox"></div>
      <div class="persona-command-palette-empty" hidden>No matching Persona pages.</div>
      <div class="persona-command-palette-footer">
        <span>↑↓ Select</span>
        <span>↵ Open</span>
      </div>
    </div>
  `;

  const panel = root.querySelector<HTMLElement>(".persona-command-palette-panel")!;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const list = root.querySelector<HTMLElement>(".persona-command-palette-results")!;
  const empty = root.querySelector<HTMLElement>(".persona-command-palette-empty")!;

  const nextState: CommandPaletteState = {
    root,
    panel,
    input,
    list,
    empty,
    options,
    activeIndex: 0,
    visibleItems: [],
    lastFocus: null,
    triggerListeners: new WeakSet(),
    documentKeydown: (event) => {
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key === "Escape" && !root.hidden) {
        event.preventDefault();
        closePalette(true);
      }
    },
    rootClick: (event) => {
      if ((event.target as HTMLElement | null)?.hasAttribute("data-command-palette-close")) {
        closePalette(true);
      }
    },
    inputKeydown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex(nextState.activeIndex + delta);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = nextState.visibleItems[nextState.activeIndex];
        if (item) selectItem(item);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette(true);
      }
    },
    inputListener: () => {
      nextState.activeIndex = 0;
      renderResults();
    },
    listClick: (event) => {
      const itemEl = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-command-palette-item]",
      );
      if (!itemEl) return;
      event.preventDefault();
      const item = nextState.visibleItems.find((entry) => entry.id === itemEl.dataset.itemId);
      if (item) selectItem(item);
    },
  };

  root.addEventListener("click", nextState.rootClick);
  input.addEventListener("keydown", nextState.inputKeydown);
  input.addEventListener("input", nextState.inputListener);
  list.addEventListener("click", nextState.listClick);
  document.addEventListener("keydown", nextState.documentKeydown);
  document.body.appendChild(root);
  state = nextState;
  updateChrome();
  renderResults();
  return nextState;
}

function updateChrome(): void {
  if (!state) return;
  const { root, input, options } = state;
  root.querySelector("#persona-command-palette-title")!.textContent =
    options.title ?? DEFAULT_TITLE;
  root.querySelector(".persona-command-palette-meta p")!.textContent =
    options.subtitle ?? DEFAULT_SUBTITLE;
  input.placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
}

function renderResults(): void {
  if (!state) return;
  const { list, empty, input, options } = state;
  const matches = searchCommandPaletteItems(options.items, input.value).slice(0, 30);
  state.visibleItems = matches;
  state.activeIndex = matches.length === 0 ? -1 : clamp(state.activeIndex, 0, matches.length - 1);
  list.replaceChildren();
  empty.hidden = matches.length > 0;

  let currentSection = "";
  for (const item of matches) {
    if (item.section !== currentSection) {
      currentSection = item.section;
      const heading = document.createElement("div");
      heading.className = "persona-command-palette-section";
      heading.textContent = currentSection;
      list.appendChild(heading);
    }

    const link = document.createElement("a");
    link.className = "persona-command-palette-item";
    link.href = item.href;
    link.setAttribute("role", "option");
    link.setAttribute("data-command-palette-item", "");
    link.dataset.itemId = item.id;

    const body = document.createElement("span");
    body.className = "persona-command-palette-item-body";
    const title = document.createElement("span");
    title.className = "persona-command-palette-item-title";
    title.textContent = item.title;
    const subtitle = document.createElement("span");
    subtitle.className = "persona-command-palette-item-subtitle";
    subtitle.textContent = item.subtitle ?? item.href;
    body.append(title, subtitle);

    const shortcut = document.createElement("span");
    shortcut.className = "persona-command-palette-item-shortcut";
    shortcut.textContent = item.current ? "current" : "open";

    link.append(body, shortcut);
    list.appendChild(link);
  }

  syncActiveItem();
}

function syncActiveItem(): void {
  if (!state) return;
  const itemEls = Array.from(
    state.list.querySelectorAll<HTMLElement>("[data-command-palette-item]"),
  );
  itemEls.forEach((itemEl, index) => {
    const active = index === state!.activeIndex;
    itemEl.classList.toggle("is-active", active);
    itemEl.setAttribute("aria-selected", active ? "true" : "false");
    if (active && typeof itemEl.scrollIntoView === "function") {
      itemEl.scrollIntoView({ block: "nearest" });
    }
  });
}

function setActiveIndex(index: number): void {
  if (!state || state.visibleItems.length === 0) return;
  const max = state.visibleItems.length - 1;
  state.activeIndex = index < 0 ? max : index > max ? 0 : index;
  syncActiveItem();
}

function selectItem(item: CommandPaletteItem): void {
  if (!state) return;
  const { options } = state;
  closePalette(false);
  if (options.onCommandSelect) {
    options.onCommandSelect(item.href, item);
    return;
  }
  window.location.assign(item.href);
}

function openPalette(): void {
  if (!state || !state.root.hidden) return;
  state.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.root.hidden = false;
  document.body.classList.add("persona-command-palette-open");
  state.input.value = "";
  state.activeIndex = 0;
  renderResults();
  requestAnimationFrame(() => state?.input.focus({ preventScroll: true }));
}

function closePalette(restoreFocus: boolean): void {
  if (!state || state.root.hidden) return;
  state.root.hidden = true;
  document.body.classList.remove("persona-command-palette-open");
  if (restoreFocus) state.lastFocus?.focus({ preventScroll: true });
}

export function installCommandPalette(options: CommandPaletteOptions): CommandPaletteController {
  const nextOptions = {
    ...options,
    items: [...options.items],
  };

  const palette = state ?? createRoot(nextOptions);
  palette.options = nextOptions;
  updateChrome();
  renderResults();

  if (options.trigger && !palette.triggerListeners.has(options.trigger)) {
    options.trigger.addEventListener("click", () => openPalette());
    palette.triggerListeners.add(options.trigger);
  }

  return {
    open: openPalette,
    close: () => closePalette(true),
    destroy: () => {
      if (!state) return;
      document.removeEventListener("keydown", state.documentKeydown);
      state.root.removeEventListener("click", state.rootClick);
      state.input.removeEventListener("keydown", state.inputKeydown);
      state.input.removeEventListener("input", state.inputListener);
      state.list.removeEventListener("click", state.listClick);
      state.root.remove();
      document.body.classList.remove("persona-command-palette-open");
      state = null;
    },
  };
}
