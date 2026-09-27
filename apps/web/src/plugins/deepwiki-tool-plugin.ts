/**
 * DeepWiki tool card: a `renderToolCall` plugin that swaps the generic tool
 * bubble for a DeepWiki-branded "consulting the wiki" card whenever the docs
 * agent calls a DeepWiki MCP tool. Every other tool falls through to the
 * default bubble.
 *
 * The card is stateless markup (no listeners): Persona morphs plugin output on
 * every streamed update, so all state lives in the tool call itself. Styles
 * live in deepwiki-tool-plugin.css.
 */

import "./deepwiki-tool-plugin.css";

import type { AgentWidgetMessage, AgentWidgetPlugin } from "@runtypelabs/persona";

type ToolCall = NonNullable<AgentWidgetMessage["toolCall"]>;

const DEFAULT_REPO = "runtypelabs/persona";

/** DeepWiki MCP actions → what the card says the agent is doing. */
const ACTION_LABELS: Record<string, { running: string; done: string }> = {
  ask_question: { running: "Asking the wiki", done: "Asked the wiki" },
  read_wiki_structure: { running: "Reading the table of contents", done: "Read the table of contents" },
  read_wiki_contents: { running: "Reading the wiki", done: "Read the wiki" },
};

/**
 * Lookups routinely take 10s+, and a tool call can sit untouched (no
 * re-render) for that whole wait, so the running state is animated purely in
 * CSS: these phrases tick by on a fixed schedule and the last one holds.
 */
const RUNNING_PHRASES = [
  "Opening the wiki index",
  "Scanning relevant pages",
  "Reading source-linked sections",
  "Cross-referencing the codebase",
  "Still digging: deep lookups take a moment",
];

/** Runtype prefixes MCP tools (e.g. `mcp_custom_deepwiki_ask_question`). */
export const isDeepWikiTool = (name: string | undefined): boolean =>
  Boolean(name && /deepwiki/i.test(name));

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

// Stacked-pages glyph: a generic "wiki" mark (not DeepWiki's logo).
const GLYPH_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<rect x="4.5" y="1.5" width="10" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
  '<path d="M1.5 4.5v10h10" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
  '<path d="M7 5h5M7 7.5h5M7 10h3" stroke="currentColor" stroke-width="1.2"/>' +
  "</svg>";

const header = (repo: string, trailing: HTMLElement): HTMLElement => {
  const bar = el("div", "persona-deepwiki-card__header");
  const brand = el("span", "persona-deepwiki-card__brand");
  const glyph = el("span", "persona-deepwiki-card__glyph");
  glyph.innerHTML = GLYPH_SVG;
  brand.append(glyph, el("span", "", "DeepWiki"));
  bar.append(brand, el("span", "persona-deepwiki-card__repo", repo), trailing);
  return bar;
};

/** Skeleton wiki page with a scan band sweeping down it. */
const pageScanner = (): HTMLElement => {
  const page = el("div", "persona-deepwiki-card__page");
  page.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 7; i += 1) page.append(el("i", ""));
  page.append(el("span", "persona-deepwiki-card__band"));
  return page;
};

const renderRunning = (card: HTMLElement, toolCall: ToolCall, repo: string, question?: string) => {
  const labels = labelsFor(actionFromName(toolCall.name ?? ""));
  // Sync the CSS clock and phrase ticker to when the call actually started, so
  // a re-render (or a remount mid-lookup) doesn't restart them at zero.
  const sinceStart = toolCall.startedAt ? Math.max(0, Date.now() - toolCall.startedAt) : 0;
  card.style.setProperty("--dw-delay", `-${sinceStart}ms`);

  const clock = el("span", "persona-deepwiki-card__clock");
  clock.setAttribute("aria-hidden", "true");

  const copy = el("div", "persona-deepwiki-card__copy");
  const track = el("div", "persona-deepwiki-card__ticker-track");
  RUNNING_PHRASES.forEach((phrase) => track.append(el("span", "", phrase)));
  const ticker = el("div", "persona-deepwiki-card__ticker");
  ticker.append(track);
  copy.append(el("div", "persona-deepwiki-card__action", labels.running), ticker);
  if (question) copy.append(el("blockquote", "persona-deepwiki-card__question", question));

  const stage = el("div", "persona-deepwiki-card__stage");
  stage.append(pageScanner(), copy);
  card.append(header(repo, clock), stage, el("div", "persona-deepwiki-card__progress"));
};

const renderSettled = (card: HTMLElement, toolCall: ToolCall, repo: string, question?: string) => {
  const failed = card.dataset.state === "error";
  const labels = labelsFor(actionFromName(toolCall.name ?? ""));
  const elapsed = elapsedLabel(toolCall);
  const status = el(
    "span",
    "persona-deepwiki-card__status",
    failed ? "Failed" : elapsed ? `Done · ${elapsed}` : "Done"
  );

  const body = el("div", "persona-deepwiki-card__body");
  body.append(el("div", "persona-deepwiki-card__action", failed ? "Couldn't reach the wiki" : labels.done));
  if (question) body.append(el("blockquote", "persona-deepwiki-card__question", question));
  const peek = failed ? (toolCall.error ?? "") : excerpt(resultText(toolCall.result));
  if (peek) body.append(el("p", "persona-deepwiki-card__peek", peek));

  const link = el("a", "persona-deepwiki-card__link", "Open on deepwiki.com ↗") as HTMLAnchorElement;
  link.href = `https://deepwiki.com/${repo}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  body.append(link);

  card.append(header(repo, status), body);
};

export const renderDeepWikiCard = (toolCall: ToolCall): HTMLElement => {
  const repo = readArg(toolCall.args, "repoName") ?? DEFAULT_REPO;
  const question = readArg(toolCall.args, "question");
  const failed = Boolean(toolCall.error) || toolCall.success === false;

  const card = el("div", "persona-deepwiki-card");
  card.dataset.state = failed ? "error" : toolCall.status === "complete" ? "done" : "running";
  card.setAttribute("role", "status");
  if (card.dataset.state === "running") renderRunning(card, toolCall, repo, question);
  else renderSettled(card, toolCall, repo, question);
  return card;
};

export const createDeepWikiToolPlugin = (): AgentWidgetPlugin => ({
  id: "deepwiki-tool-card",
  renderToolCall: ({ message }) =>
    message.toolCall && isDeepWikiTool(message.toolCall.name)
      ? renderDeepWikiCard(message.toolCall)
      : null,
});
