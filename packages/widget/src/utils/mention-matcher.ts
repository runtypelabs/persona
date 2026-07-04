/**
 * Default fuzzy matcher + static-source helper for context mentions.
 *
 * Pure and dependency-free so it can be exported for hosts (to filter
 * client-side sources) and unit-tested in isolation. Ranking tiers, best first:
 *   1. prefix       — label starts with the query
 *   2. word-boundary — a word inside the label starts with the query
 *   3. subsequence   — query chars appear in order anywhere in the label
 * Ties break by `recencyScore` (desc) then label (asc). An empty query returns
 * every item ordered by recency (recents/popular first).
 */

import type {
  AgentWidgetContextMentionCommandContext,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

// Match tiers, best (lowest) first. Plain numbers rather than a const enum so
// the module stays isolatedModules-safe.
const TIER_PREFIX = 0;
const TIER_WORD_BOUNDARY = 1;
const TIER_SUBSEQUENCE = 2;
const TIER_NONE = 3;

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let n = 0;
  for (let h = 0; h < haystack.length && n < needle.length; h++) {
    if (haystack[h] === needle[n]) n++;
  }
  return n === needle.length;
}

function scoreItem(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l.startsWith(q)) return TIER_PREFIX;
  // Word boundaries: whitespace, hyphen, underscore, slash, dot, camelCase.
  // Split camelCase by inserting a space at lower→upper transitions first
  // (a lookbehind-free rewrite — lookbehind is a parse error on Safari < 16.4,
  // and this module ships in the core bundle, so a regex literal there would
  // break the whole widget on those browsers even with mentions disabled).
  const words = label.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s\-_/.]+/);
  if (words.some((w) => w.toLowerCase().startsWith(q))) return TIER_WORD_BOUNDARY;
  if (isSubsequence(q, l)) return TIER_SUBSEQUENCE;
  return TIER_NONE;
}

function compareWithinTier(
  a: AgentWidgetContextMentionItem,
  b: AgentWidgetContextMentionItem
): number {
  const ra = a.recencyScore ?? 0;
  const rb = b.recencyScore ?? 0;
  if (rb !== ra) return rb - ra;
  return a.label.localeCompare(b.label);
}

/**
 * Filter + rank items for the current `@query`. An empty query keeps all items,
 * recency-ordered. Non-matching items are dropped.
 */
export function defaultMentionFilter(
  items: AgentWidgetContextMentionItem[],
  query: string
): AgentWidgetContextMentionItem[] {
  const q = query.trim();
  if (!q) {
    return [...items].sort(compareWithinTier);
  }
  const scored: { item: AgentWidgetContextMentionItem; tier: number }[] = [];
  for (const item of items) {
    const tier = scoreItem(item.label, q);
    if (tier !== TIER_NONE) scored.push({ item, tier });
  }
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return compareWithinTier(a.item, b.item);
  });
  return scored.map((s) => s.item);
}

/**
 * Split a command-channel query into its command NAME (first token) and ARGS
 * (everything after, trimmed). `"deploy staging"` → `{ name: "deploy", args:
 * "staging" }`; `"deploy"` → `{ name: "deploy", args: "" }`. Shared by the
 * slash-command source (matches on `name`) and the controller (captures `args`).
 */
export function splitCommandQuery(query: string): { name: string; args: string } {
  const trimmed = query.replace(/^\s+/, "");
  const sp = trimmed.search(/\s/);
  if (sp === -1) return { name: trimmed, args: "" };
  return { name: trimmed.slice(0, sp), args: trimmed.slice(sp + 1).trim() };
}

/**
 * The easy path: a static, in-memory list filtered client-side with
 * {@link defaultMentionFilter}. Supply your own `resolve()` to turn a selected
 * item into a dispatch payload (lead with `llmAppend`).
 */
export function createStaticMentionSource(opts: {
  id: string;
  label: string;
  items: AgentWidgetContextMentionItem[];
  resolve: AgentWidgetContextMentionSource["resolve"];
  resolveOn?: "select" | "submit";
}): AgentWidgetContextMentionSource {
  return {
    id: opts.id,
    label: opts.label,
    resolveOn: opts.resolveOn,
    search: (query) => defaultMentionFilter(opts.items, query),
    resolve: opts.resolve,
  };
}

/**
 * A single slash-command definition for {@link createSlashCommandsSource}. Maps
 * to a menu item plus its dispatch behavior (see `AgentWidgetContextMentionItem.command`):
 *  - `"prompt"` (default): `prompt` text is written into the composer (a macro).
 *  - `"action"`: `action()` runs in the browser (no message sent).
 *  - `"server"`: `data` is sent to the backend via request `context.mentions`.
 */
export type SlashCommandDefinition = {
  /** Command name shown after the trigger (e.g. "summarize" → `/summarize`). */
  name: string;
  /** Menu subtitle. */
  description?: string;
  /** Lucide icon name for the menu row / chip. */
  iconName?: string;
  /** Dispatch kind. @default "prompt" */
  kind?: "prompt" | "action" | "server";
  /** `kind:"prompt"` — composer text (static, or built from the typed args). */
  prompt?: string | ((args: string) => string);
  /** `kind:"prompt"` — insertion mode. @default "replace" */
  insertMode?: "replace" | "insert-at-caret";
  /** `kind:"prompt"` — submit the composer immediately after inserting. */
  submitOnSelect?: boolean;
  /** `kind:"action"` — the browser handler (receives parsed `args`). */
  action?: (ctx: AgentWidgetContextMentionCommandContext) => void | Promise<void>;
  /** `kind:"server"` — structured payload sent via `context.mentions.<sourceId>.<name>`. */
  data?:
    | Record<string, unknown>
    | ((args: string) => Record<string, unknown>);
};

/**
 * Build a `/`-slash-command SOURCE for `contextMentions.triggers`. Unlike a
 * mention source, its items are COMMANDS (verbs): selecting one runs a prompt
 * macro, a client action, or a server skill (see {@link SlashCommandDefinition}).
 *
 * Matching is on the command NAME only (the first token of the query), so
 * `/deploy staging` still matches the `deploy` command while `staging` becomes
 * the command's `args`. Pair it with a `"/"` channel, typically at line-start:
 *
 * ```ts
 * contextMentions: {
 *   enabled: true,
 *   sources: [ ...mentionSources ],           // @ context
 *   triggers: [{
 *     trigger: "/",
 *     triggerPosition: "line-start",
 *     sources: [createSlashCommandsSource({ id: "cmd", label: "Commands", commands })],
 *   }],
 * }
 * ```
 */
export function createSlashCommandsSource(opts: {
  id: string;
  label: string;
  commands: SlashCommandDefinition[];
}): AgentWidgetContextMentionSource {
  const items: AgentWidgetContextMentionItem[] = opts.commands.map((c) => ({
    id: c.name,
    label: c.name,
    description: c.description,
    iconName: c.iconName,
    command: c.kind ?? "prompt",
    insertMode: c.insertMode,
    submitOnSelect: c.submitOnSelect,
    action: c.action,
  }));
  const byName = new Map(opts.commands.map((c) => [c.name, c]));

  return {
    id: opts.id,
    label: opts.label,
    // Server commands defer resolve to submit (args captured at select). Prompt
    // commands call resolve synchronously from the controller; action commands
    // never resolve. So "submit" is the correct source-level default here.
    resolveOn: "submit",
    search: (query) => defaultMentionFilter(items, splitCommandQuery(query).name),
    resolve: (item, ctx) => {
      const def = byName.get(item.id);
      if (!def) return {};
      if (def.kind === "server") {
        const data =
          typeof def.data === "function" ? def.data(ctx.args) : def.data;
        return { context: data ?? {} };
      }
      // prompt (and the default): the composer-insert text.
      const text =
        typeof def.prompt === "function" ? def.prompt(ctx.args) : def.prompt ?? "";
      return { insertText: text };
    },
  };
}
