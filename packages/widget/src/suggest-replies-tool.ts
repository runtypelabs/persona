/**
 * Built-in `suggest_replies` client tool.
 *
 * The widget can advertise this tool to the agent on every dispatch via
 * `clientTools[]` (set `suggestions.followUps.expose: true`): the same
 * wire surface as `ask_user_question` and WebMCP page tools. When the model
 * calls it, the execution pauses with a `step_await` (a local-tool pause
 * carries no `awaitReason`; that discriminator is internal). Unlike
 * `ask_user_question`, the widget resolves it FIRE-AND-FORGET: it renders the
 * configured follow-up surface and immediately resumes the execution with a
 * canned "shown" result, so the turn completes without waiting on the user.
 *
 * Chip visibility is DERIVED state, not imperative show/hide: the chips of
 * the last `suggest_replies` tool message with no user message after it are
 * shown (see {@link latestAgentSuggestions}). That single rule covers
 * soft-dismiss on any user message (typed, voice, or chip click), restore on
 * reload/hydration, and latest-wins when a turn carries multiple calls.
 */

import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetSuggestion,
  ClientToolDefinition,
} from "./types";

export const SUGGEST_REPLIES_TOOL_NAME = "suggest_replies";

/** Renderer cap: payloads beyond this are truncated with a console warning. */
export const SUGGEST_REPLIES_MAX = 4;

/**
 * JSON Schema for the tool's parameters. The model owns semantics only: id,
 * icon, behavior, and emphasis are presentation, and hosts set them with the
 * `transformSuggestions` plugin hook. A single object type is used because
 * strict structured-output modes reject or flatten `oneOf`.
 */
export const SUGGEST_REPLIES_PARAMETERS_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      minItems: 1,
      maxItems: SUGGEST_REPLIES_MAX,
      description:
        "1-4 short, distinct follow-up replies, phrased in the user's voice.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", minLength: 1, maxLength: 80 },
          prompt: { type: "string", minLength: 1, maxLength: 500 },
          description: { type: "string", minLength: 1, maxLength: 160 },
        },
        required: ["label"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

/**
 * The `ClientToolDefinition` shipped on `dispatch.clientTools[]` when
 * `suggestions.followUps.expose` is on. Exported so integrators who prefer
 * declaring the tool server-side (a flow's `runtimeTools`) can reuse the same
 * description and schema instead of hand-writing them.
 */
export const SUGGEST_REPLIES_CLIENT_TOOL: ClientToolDefinition = {
  name: SUGGEST_REPLIES_TOOL_NAME,
  description:
    "Offer the user tappable quick-reply suggestions for their next message. " +
    "Call at most once per turn, as the last action after your reply text is " +
    "complete. Give each suggestion a `label` with the short visible text, an " +
    "optional `prompt` with the fuller text placed as the user's message " +
    "(defaults to the label), and an optional `description` with one line of " +
    "supporting copy. Suggestions are sent as the user's next message, so " +
    'phrase prompts in the user\'s voice (e.g. "Tell me more about pricing"). ' +
    "Keep them short and distinct. The result only confirms the suggestions " +
    "were shown: do not add further commentary after calling this tool; end " +
    "your turn.",
  parametersSchema: SUGGEST_REPLIES_PARAMETERS_SCHEMA,
  origin: "sdk",
  annotations: { readOnlyHint: true },
};

/**
 * The canned tool output posted to `/resume` the moment the chips render.
 * MCP content shape, matching what the WebMCP resume path posts for page
 * tools. Built fresh per call so a caller can't mutate a shared object.
 */
export const suggestRepliesToolResult = (): {
  content: { type: "text"; text: string }[];
} => ({
  content: [{ type: "text", text: "Suggestions shown to the user." }],
});

/** A tool-variant message produced by a `suggest_replies` call. */
export const isSuggestRepliesMessage = (
  message: AgentWidgetMessage,
): boolean =>
  message.variant === "tool" &&
  message.toolCall?.name === SUGGEST_REPLIES_TOOL_NAME;

/**
 * Tolerant parse of a `suggest_replies` tool call's args into suggestion
 * items. Plain strings stay strings for older flows that emit
 * `suggestions: string[]`; objects keep only label, prompt, and description,
 * so a model that ignores `additionalProperties` cannot set presentation.
 * Hosts add id, icon, behavior, and emphasis via `transformSuggestions`.
 */
export const parseSuggestRepliesPayload = (
  args: unknown
): AgentWidgetSuggestion[] => {
  let parsed: unknown = args;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  const raw = (parsed as { suggestions?: unknown } | null | undefined)
    ?.suggestions;
  if (!Array.isArray(raw)) return [];
  const suggestions = raw.flatMap<AgentWidgetSuggestion>((item) => {
    if (typeof item === "string") {
      const value = item.trim();
      return value ? [value] : [];
    }
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (typeof value.label !== "string" || !value.label.trim()) return [];
    const suggestion: Exclude<AgentWidgetSuggestion, string> = {
      label: value.label.trim(),
    };
    if (typeof value.prompt === "string" && value.prompt.trim()) {
      suggestion.prompt = value.prompt.trim();
    }
    if (typeof value.description === "string" && value.description.trim()) {
      suggestion.description = value.description.trim();
    }
    return [suggestion];
  });
  if (suggestions.length > SUGGEST_REPLIES_MAX) {
    console.warn(
      `[persona] suggest_replies: ${suggestions.length} suggestions exceeds the cap of ${SUGGEST_REPLIES_MAX}; extra suggestions dropped.`,
    );
    return suggestions.slice(0, SUGGEST_REPLIES_MAX);
  }
  return suggestions;
};

/**
 * The chips to show right now: those of the LAST `suggest_replies` tool
 * message with NO user message after it, or `null` when none apply. All
 * calls in a turn still get resumed (the server awaits each); only the
 * latest renders.
 */
export const latestAgentSuggestions = (
  messages: AgentWidgetMessage[],
): AgentWidgetSuggestion[] | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") return null;
    if (!isSuggestRepliesMessage(message)) continue;
    const chips = parseSuggestRepliesPayload(message.toolCall?.args);
    return chips.length > 0 ? chips : null;
  }
  return null;
};

export type ResolvedFollowUpsFeature = {
  /** Widget renders follow-up chips and auto-resumes the tool call. */
  enabled: boolean;
  /** Tool ships on `dispatch.clientTools[]`. */
  expose: boolean;
};

// Keyed on the conflict itself, not the config object: `controller.update()`
// rebuilds the config on every call, so an object-keyed dedupe re-warns
// forever. Trade-off: two widgets with the identical conflict warn once total
// per page load.
const conflictWarnings = new Set<string>();

/** Always warns, debug or not: a config conflict is a developer error. */
const warnConflict = (
  key: "enabled" | "expose",
  legacyValue: boolean,
  newValue: boolean,
): void => {
  const signature = `${key}:${legacyValue}:${newValue}`;
  if (conflictWarnings.has(signature)) return;
  conflictWarnings.add(signature);
  console.warn(
    `[persona] suggestions.followUps.${key} and features.suggestReplies.${key} disagree; suggestions.followUps.${key} wins.`,
  );
};

/**
 * Single source of truth for the follow-ups capability flags. Resolution is
 * per key so a `features.suggestReplies` embed that adds presentation-only
 * `suggestions.followUps` keys is not silently re-enabled. `expose` is forced
 * off when `enabled` resolves false: advertising the tool without the widget
 * auto-resolving it parks the execution on a generic tool bubble.
 */
export const resolveFollowUpsFeature = (
  config: AgentWidgetConfig | undefined,
): ResolvedFollowUpsFeature => {
  const followUps = config?.suggestions?.followUps;
  const legacy = config?.features?.suggestReplies;
  const warnIfConflicting = (key: "enabled" | "expose"): void => {
    const newValue = followUps?.[key];
    const legacyValue = legacy?.[key];
    if (newValue === undefined || legacyValue === undefined) return;
    if (newValue === legacyValue) return;
    warnConflict(key, legacyValue, newValue);
  };
  if (config) {
    warnIfConflicting("enabled");
    warnIfConflicting("expose");
  }
  const enabled = followUps?.enabled ?? legacy?.enabled ?? true;
  const expose = enabled
    ? followUps?.expose ?? legacy?.expose ?? false
    : false;
  return { enabled, expose };
};
