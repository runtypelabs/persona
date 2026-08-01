import type {
  AgentWidgetController,
  AgentWidgetPlugin,
  AgentWidgetSuggestion,
} from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

/**
 * Blueprint C: help search
 *
 * Composes with the default welcome instead of replacing it: the hook returns
 * `ctx.defaultRenderer()` with a search card appended, so the greeting, icon,
 * and starters keep rendering and derived visibility still governs the surface.
 *
 * Everything help-provider specific is a plugin option. Debounce, abort, and
 * stale-response rejection live here; the core is not involved.
 */

export type HelpSearchArticle = {
  id: string;
  title: string;
  url: string;
  /** One line of context under the title. */
  summary?: string;
  /** Section or collection label, e.g. "Billing". */
  section?: string;
};

export type HelpSearchPluginOptions = {
  /**
   * Query the host's help center. The signal aborts when a newer keystroke
   * supersedes this query or the welcome surface re-renders.
   */
  search: (
    query: string,
    signal: AbortSignal,
  ) => Promise<HelpSearchArticle[]>;
  /**
   * What a result click does. `"open"` renders an anchor with
   * `target="_blank"`; `"ask"` sends `askPrompt(article)` to the agent.
   */
  resultAction?: "open" | "ask";
  /** Prompt template for `resultAction: "ask"`. */
  askPrompt?: (article: HelpSearchArticle) => string;
  /** Default 200. */
  debounceMs?: number;
  /** Shorter queries reset to the idle state without a request. Default 2. */
  minQueryLength?: number;
  /** Default 4. */
  maxResults?: number;
  /** Input label, read by screen readers. Default "Search help articles". */
  label?: string;
  /** Default "Search help articles". */
  placeholder?: string;
  /**
   * Replace the configured starters with the current results through
   * `transformSuggestions`, restoring them when the query clears. Requires
   * `attach(controller)`: starters re-render on config updates, not on
   * `ctx.requestRender()`.
   */
  promoteResultsToStarters?: boolean;
};

export type HelpSearchPlugin = AgentWidgetPlugin & {
  /** Header entry point: wire to `layout.header.trailingActions` + `onAction`. */
  focusSearch: () => void;
  /**
   * Host-closure controller pattern. Only needed for
   * `promoteResultsToStarters`.
   */
  attach: (controller: AgentWidgetController) => void;
};

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; articles: HelpSearchArticle[] }
  | { kind: "empty" }
  | { kind: "error" };

const HELP_SEARCH_CSS = `
.help-search {
  width: 100%;
  margin-top: 14px;
  display: grid;
  gap: 8px;
  text-align: left;
}

.help-search__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.help-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  color: var(--persona-text, #111827);
  background: var(--persona-surface, #ffffff);
  border: 1px solid var(--persona-border, #e5e7eb);
  border-radius: 12px;
}

.help-search__input::placeholder {
  color: var(--persona-muted, #6b7280);
}

.help-search__input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--persona-accent, #171717) 45%, transparent);
  outline-offset: 1px;
}

.help-search__status {
  font-size: 12px;
  color: var(--persona-muted, #6b7280);
}

.help-search__status[hidden] {
  display: none;
}

.help-search__results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.help-search__result {
  width: 100%;
  box-sizing: border-box;
  display: grid;
  gap: 2px;
  padding: 9px 11px;
  text-align: left;
  text-decoration: none;
  color: inherit;
  background: transparent;
  border: 1px solid var(--persona-border, #e5e7eb);
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  transition: background-color 140ms ease, border-color 140ms ease;
}

.help-search__result:hover {
  background: color-mix(in srgb, var(--persona-accent, #171717) 6%, transparent);
  border-color: color-mix(in srgb, var(--persona-accent, #171717) 34%, var(--persona-border, #e5e7eb));
}

.help-search__result:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--persona-accent, #171717) 45%, transparent);
  outline-offset: 2px;
}

.help-search__result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--persona-text, #111827);
}

.help-search__result-meta {
  font-size: 12px;
  color: var(--persona-muted, #6b7280);
}
`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const defaultAskPrompt = (article: HelpSearchArticle): string =>
  `Summarize this help article for me: "${article.title}" (${article.url})`;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** WAAPI, never a CSS transition: re-renders cancel transitions mid-flight. */
const animateResultsIn = (items: HTMLElement[]): void => {
  if (prefersReducedMotion()) return;
  items.forEach((item, index) => {
    if (typeof item.animate !== "function") return;
    item.animate(
      [
        { opacity: "0", transform: "translateY(4px)" },
        { opacity: "1", transform: "none" },
      ],
      { duration: 180, delay: index * 60, easing: "ease-out", fill: "backwards" },
    );
  });
};

export const createHelpSearchPlugin = (
  options: HelpSearchPluginOptions,
): HelpSearchPlugin => {
  const debounceMs = options.debounceMs ?? 200;
  const minQueryLength = options.minQueryLength ?? 2;
  const maxResults = options.maxResults ?? 4;
  const resultAction = options.resultAction ?? "open";
  const askPrompt = options.askPrompt ?? defaultAskPrompt;
  const label = options.label ?? "Search help articles";
  const placeholder = options.placeholder ?? "Search help articles";

  // Query and results outlive one render: a `controller.update()` re-arbitrates
  // the welcome surface and would otherwise wipe what the user typed.
  let query = "";
  let state: SearchState = { kind: "idle" };
  let input: HTMLInputElement | null = null;
  let paint: (() => void) | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;
  let requestSeq = 0;
  let controller: AgentWidgetController | null = null;
  let promotedKey = "";

  const promotedArticles = (): HelpSearchArticle[] =>
    state.kind === "results" ? state.articles : [];

  // Starters re-render on config updates only, so a no-op patch is the public
  // way to re-run `transformSuggestions` after results change.
  const syncPromotedStarters = (): void => {
    if (options.promoteResultsToStarters !== true) return;
    const key = promotedArticles()
      .map((article) => article.id)
      .join("|");
    if (key === promotedKey) return;
    promotedKey = key;
    controller?.update({});
  };

  const setState = (next: SearchState): void => {
    state = next;
    paint?.();
    syncPromotedStarters();
  };

  const cancelPending = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    inFlight?.abort();
    inFlight = null;
  };

  const runSearch = (value: string): void => {
    cancelPending();
    query = value;
    const trimmed = value.trim();
    if (trimmed.length < minQueryLength) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "searching" });
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const abort = new AbortController();
      const seq = ++requestSeq;
      inFlight = abort;
      void Promise.resolve(options.search(trimmed, abort.signal))
        .then((articles) => {
          // Stale responses lose to the newest query, aborted or not.
          if (seq !== requestSeq) return;
          inFlight = null;
          setState(
            articles.length > 0
              ? { kind: "results", articles: articles.slice(0, maxResults) }
              : { kind: "empty" },
          );
        })
        .catch(() => {
          if (seq !== requestSeq) return;
          inFlight = null;
          setState({ kind: "error" });
        });
    }, debounceMs);
  };

  const buildResult = (
    article: HelpSearchArticle,
    sendMessage: (text: string) => void,
  ): HTMLElement => {
    const meta = [article.section, article.summary].filter(Boolean).join(" · ");
    const title = el("span", "help-search__result-title", article.title);

    if (resultAction === "open") {
      const link = el("a", "help-search__result");
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(title);
      if (meta) link.append(el("span", "help-search__result-meta", meta));
      return link;
    }

    const button = el("button", "help-search__result");
    button.type = "button";
    button.append(title);
    button.append(
      el("span", "help-search__result-meta", meta || "Ask the assistant"),
    );
    button.addEventListener("click", () => {
      sendMessage(askPrompt(article));
      if (input) input.value = "";
      cancelPending();
      setState({ kind: "idle" });
      query = "";
    });
    return button;
  };

  const statusText = (): string => {
    if (state.kind === "searching") return "Searching…";
    if (state.kind === "empty") return `No articles match “${query.trim()}”.`;
    if (state.kind === "error") return "Search is unavailable right now.";
    return "";
  };

  return {
    id: "demo-help-search",

    focusSearch: () => {
      input?.focus();
      input?.select();
    },

    attach: (next: AgentWidgetController) => {
      controller = next;
    },

    /**
     * Optional composition: while results exist they stand in for the
     * configured starters, and the originals return when the query clears.
     */
    transformSuggestions: ({ suggestions, surface }) => {
      if (options.promoteResultsToStarters !== true) return suggestions;
      if (surface !== "starter") return suggestions;
      const articles = promotedArticles();
      if (articles.length === 0) return suggestions;
      return articles.map<AgentWidgetSuggestion>((article) => ({
        id: `help-${article.id}`,
        label: article.title,
        description: article.summary,
        prompt: askPrompt(article),
        icon: "file-text",
        behavior: "send",
      }));
    },

    renderWelcome: ({ defaultRenderer, sendMessage, onCleanup }) => {
      const host = defaultRenderer();

      const card = el("section", "help-search");
      card.setAttribute("role", "search");

      const inputId = `help-search-input-${Math.random().toString(36).slice(2, 8)}`;
      const labelEl = el("label", "help-search__label", label);
      labelEl.htmlFor = inputId;

      const field = el("input", "help-search__input");
      field.type = "search";
      field.id = inputId;
      field.placeholder = placeholder;
      field.autocomplete = "off";
      field.value = query;

      const status = el("div", "help-search__status");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");

      const results = el("ul", "help-search__results");

      card.append(labelEl, field, status, results);
      host.appendChild(card);
      injectStyles(card, "persona-help-search-plugin", HELP_SEARCH_CSS);

      input = field;
      const paintThisCard = () => {
        const text = statusText();
        status.textContent = text;
        status.hidden = text === "";
        results.replaceChildren();
        if (state.kind !== "results") return;
        const items = state.articles.map((article) => {
          const item = el("li");
          item.appendChild(buildResult(article, sendMessage));
          results.appendChild(item);
          return item;
        });
        animateResultsIn(items);
      };
      paint = paintThisCard;
      paintThisCard();

      const onInput = () => runSearch(field.value);
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || field.value === "") return;
        event.stopPropagation();
        field.value = "";
        runSearch("");
      };
      field.addEventListener("input", onInput);
      field.addEventListener("keydown", onKeyDown);

      onCleanup(() => {
        cancelPending();
        field.removeEventListener("input", onInput);
        field.removeEventListener("keydown", onKeyDown);
        card.remove();
        // A cleanup can run after the next render in a nested re-arbitration.
        if (input === field) input = null;
        if (paint === paintThisCard) paint = null;
      });

      // Returning the host is composition, not a takeover: the default welcome
      // content stays and derived visibility still governs.
      return host;
    },
  };
};

/**
 * Tiny static index so the demo runs with no help-center backend. A real host
 * swaps this for a Zendesk Guide, Algolia, or in-house search call.
 */
export const createStaticArticleSearch = (
  articles: HelpSearchArticle[],
  latencyMs = 220,
): HelpSearchPluginOptions["search"] =>
  (query, signal) =>
    new Promise<HelpSearchArticle[]>((resolve, reject) => {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve(
          articles.filter((article) => {
            const haystack =
              `${article.title} ${article.summary ?? ""} ${article.section ?? ""}`.toLowerCase();
            return terms.every((term) => haystack.includes(term));
          }),
        );
      }, latencyMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
