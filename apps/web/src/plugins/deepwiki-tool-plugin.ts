/**
 * DeepWiki tool card: a `renderToolCall` plugin that swaps the generic tool
 * bubble for a DeepWiki-branded "consulting the wiki" card whenever the agent
 * calls a DeepWiki MCP tool. Every other tool falls through to the default
 * bubble.
 *
 * The card is stateless markup (no listeners): Persona morphs plugin output on
 * every streamed update, so all state lives in the tool call itself. Styles
 * live in deepwiki-tool-plugin.css and build on the widget's theme variables.
 */

import "./deepwiki-tool-plugin.css";

import type { AgentWidgetMessage, AgentWidgetPlugin } from "@runtypelabs/persona";

type ToolCall = NonNullable<AgentWidgetMessage["toolCall"]>;

export type DeepWikiToolPluginOptions = {
  /** Plugin id. @default "deepwiki-tool-card" */
  id?: string;
  /**
   * Which tool calls get the card; everything else falls through to the
   * default bubble. @default names containing "deepwiki" (Runtype prefixes MCP
   * tools, e.g. `mcp_custom_deepwiki_ask_question`)
   */
  match?: (toolName: string) => boolean;
  /** `owner/repo` shown when a call's args carry no valid `repoName`. */
  defaultRepo?: string;
  /** Narration cycled while a lookup runs; the last phrase holds. */
  runningPhrases?: string[];
  /** Seconds each running phrase shows. @default 3.2 */
  phraseSeconds?: number;
};

type CardOptions = Omit<DeepWikiToolPluginOptions, "id" | "match">;

/** DeepWiki MCP actions → what the card says the agent is doing. */
const ACTION_LABELS: Record<string, { running: string; done: string }> = {
  ask_wiki_question: { running: "Asking the wiki", done: "Asked the wiki" },
  ask_question: { running: "Asking the wiki", done: "Asked the wiki" },
  read_wiki_structure: { running: "Reading the table of contents", done: "Read the table of contents" },
  read_wiki_contents: { running: "Reading the wiki", done: "Read the wiki" },
};

/**
 * Lookups routinely take 10s+, and a tool call can sit untouched (no
 * re-render) for that whole wait, so the running state is animated purely in
 * CSS: these phrases tick by on a fixed schedule and the last one holds.
 */
const DEFAULT_PHRASES = [
  "Opening the wiki index",
  "Scanning relevant pages",
  "Reading source-linked sections",
  "Cross-referencing the codebase",
  "Still digging: deep lookups take a moment",
];

const DEFAULT_PHRASE_SECONDS = 3.2;

// Model-supplied, and it lands in a link: only accept a plain `owner/repo`.
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

// `ask_wiki_question` answers end with "View this search on DeepWiki: <url>", a
// permalink to this exact question. Only a deepwiki.com search URL is trusted.
const SEARCH_URL_PATTERN = /https:\/\/deepwiki\.com\/search\/[\w-]+/;

export const isDeepWikiTool =(name: string): boolean => /deepwiki/i.test(name);

const actionFromName = (name: string): string =>
  name.replace(/^.*deepwiki[_:.-]*/i, "") || name;

const labelsFor = (action: string) => {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (/question|ask/.test(action)) return ACTION_LABELS.ask_question;
  if (/structure/.test(action)) return ACTION_LABELS.read_wiki_structure;
  if (/contents|read/.test(action)) return ACTION_LABELS.read_wiki_contents;
  const human = action.replace(/_/g, " ");
  return { running: `Running ${human}`, done: `Ran ${human}` };
};

/** Args may arrive as an object or as (partial) streamed JSON text. */
const readArg = (args: unknown, key: string): string | undefined => {
  if (args && typeof args === "object") {
    const value = (args as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  if (typeof args === "string") {
    try {
      return readArg(JSON.parse(args), key);
    } catch {
      // Partial JSON while streaming: pull the (possibly unterminated) string.
      const match = args.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
      return match?.[1]?.replace(/\\"/g, '"').trim() || undefined;
    }
  }
  return undefined;
};

/** Flatten an MCP result (`{ content: [{ type: "text", text }] }`, string, …). */
const resultText = (result: unknown): string => {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) return result.map(resultText).join(" ");
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (record.content !== undefined) return resultText(record.content);
    if (record.result !== undefined) return resultText(record.result);
  }
  return "";
};

/** Start of the answer, markdown stripped, for a two-line peek. */
const excerpt = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]]|\(https?:[^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

const elapsedLabel = (toolCall: ToolCall): string | undefined => {
  const ms =
    toolCall.durationMs ??
    toolCall.duration ??
    (toolCall.startedAt && toolCall.completedAt
      ? toolCall.completedAt - toolCall.startedAt
      : undefined);
  if (ms === undefined || !Number.isFinite(ms)) return undefined;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const decorative = (node: HTMLElement): HTMLElement => {
  node.setAttribute("aria-hidden", "true");
  return node;
};

// Stacked-pages glyph: a generic "wiki" mark (not DeepWiki's logo).
const GLYPH_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<rect x="4.5" y="1.5" width="10" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
  '<path d="M1.5 4.5v10h10" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
  '<path d="M7 5h5M7 7.5h5M7 10h3" stroke="currentColor" stroke-width="1.2"/>' +
  "</svg>";

type CardData = { toolCall: ToolCall; repo?: string; question?: string; label: string };

const header = (repo: string | undefined, trailing: HTMLElement): HTMLElement => {
  const bar = el("div", "persona-deepwiki-card__header");
  const brand = el("span", "persona-deepwiki-card__brand");
  const glyph = el("span", "persona-deepwiki-card__glyph");
  glyph.innerHTML = GLYPH_SVG;
  brand.append(glyph, el("span", "", "DeepWiki"));
  bar.append(brand);
  if (repo) bar.append(el("span", "persona-deepwiki-card__repo", repo));
  bar.append(trailing);
  return bar;
};

/** Skeleton wiki page with a scan band sweeping down it. */
const pageScanner = (): HTMLElement => {
  const page = decorative(el("div", "persona-deepwiki-card__page"));
  for (let i = 0; i < 7; i += 1) page.append(el("i", ""));
  page.append(el("span", "persona-deepwiki-card__band"));
  return page;
};

const renderRunning = (card: HTMLElement, data: CardData, options: CardOptions) => {
  const { toolCall, repo, question, label } = data;
  const phrases = options.runningPhrases ?? DEFAULT_PHRASES;
  // Sync the CSS clock and phrases to when the call actually started, so a
  // re-render (or a remount mid-lookup) doesn't restart them at zero.
  const sinceStart = toolCall.startedAt ? Math.max(0, Date.now() - toolCall.startedAt) : 0;
  card.style.setProperty("--dw-delay", `-${sinceStart}ms`);
  card.style.setProperty("--dw-phrase", `${options.phraseSeconds ?? DEFAULT_PHRASE_SECONDS}s`);

  // Each phrase fades in at index × --dw-phrase (see CSS). Decorative: assistive
  // tech gets the action label instead.
  const ticker = decorative(el("div", "persona-deepwiki-card__ticker"));
  phrases.forEach((phrase, index) => {
    const line = el("span", "", phrase);
    line.style.setProperty("--dw-i", String(index));
    if (index === phrases.length - 1) line.dataset.last = "";
    ticker.append(line);
  });

  const copy = el("div", "persona-deepwiki-card__copy");
  copy.append(el("div", "persona-deepwiki-card__action", label), ticker);
  if (question) copy.append(el("blockquote", "persona-deepwiki-card__question", question));

  const stage = el("div", "persona-deepwiki-card__stage");
  stage.append(pageScanner(), copy);
  card.append(
    header(repo, decorative(el("span", "persona-deepwiki-card__clock"))),
    stage,
    decorative(el("div", "persona-deepwiki-card__progress"))
  );
};

const renderSettled = (card: HTMLElement, data: CardData) => {
  const { toolCall, repo, question, label } = data;
  const failed = card.dataset.state === "error";
  const elapsed = elapsedLabel(toolCall);
  const status = el(
    "span",
    "persona-deepwiki-card__status",
    failed ? "Failed" : elapsed ? `Done · ${elapsed}` : "Done"
  );

  const body = el("div", "persona-deepwiki-card__body");
  body.append(el("div", "persona-deepwiki-card__action", label));
  if (question) body.append(el("blockquote", "persona-deepwiki-card__question", question));
  const answer = failed ? "" : resultText(toolCall.result);
  const peek = failed ? (toolCall.error ?? "") : excerpt(answer);
  if (peek) body.append(el("p", "persona-deepwiki-card__peek", peek));

  // Prefer the permalink to this question; fall back to the repo's wiki.
  const searchUrl = answer.match(SEARCH_URL_PATTERN)?.[0];
  const href = searchUrl ?? (repo ? `https://deepwiki.com/${repo}` : undefined);
  if (href) {
    const text = searchUrl ? "View this answer on DeepWiki ↗" : "Open on deepwiki.com ↗";
    const link = el("a", "persona-deepwiki-card__link", text) as HTMLAnchorElement;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    body.append(link);
  }

  card.append(header(repo, status), body);
};

export const renderDeepWikiCard = (toolCall: ToolCall, options: CardOptions = {}): HTMLElement => {
  const argRepo = readArg(toolCall.args, "repoName");
  const repo = argRepo && REPO_PATTERN.test(argRepo) ? argRepo : options.defaultRepo;
  const question = readArg(toolCall.args, "question");
  const failed = Boolean(toolCall.error) || toolCall.success === false;
  const state = failed ? "error" : toolCall.status === "complete" ? "done" : "running";
  const labels = labelsFor(actionFromName(toolCall.name ?? ""));
  const label = failed ? "Couldn't reach the wiki" : state === "done" ? labels.done : labels.running;

  // Not a live region: the widget owns (debounced, opt-in) announcements, and
  // a status role here would re-announce on every streamed re-render. A
  // labelled group reads as one unit when navigated to instead.
  const card = el("div", "persona-deepwiki-card");
  card.dataset.state = state;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", `DeepWiki: ${label}`);
  const data: CardData = { toolCall, repo, question, label };
  if (state === "running") renderRunning(card, data, options);
  else renderSettled(card, data);
  return card;
};

export const createDeepWikiToolPlugin = (
  options: DeepWikiToolPluginOptions = {}
): AgentWidgetPlugin => {
  const { id = "deepwiki-tool-card", match = isDeepWikiTool, ...cardOptions } = options;
  return {
    id,
    renderToolCall: ({ message }) =>
      message.toolCall?.name && match(message.toolCall.name)
        ? renderDeepWikiCard(message.toolCall, cardOptions)
        : null,
  };
};
