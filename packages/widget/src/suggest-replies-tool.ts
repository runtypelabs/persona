/**
 * Built-in `suggest_replies` client tool.
 *
 * The widget can advertise this tool to the agent on every dispatch via
 * `clientTools[]` (set `features.suggestReplies.expose: true`) — the same
 * wire surface as `ask_user_question` and WebMCP page tools. When the model
 * calls it, the execution pauses with a `step_await`
 * (`awaitReason: "local_tool_required"`); unlike `ask_user_question`, the
 * widget resolves it FIRE-AND-FORGET — it renders the suggestions as tappable
 * chips above the composer and immediately resumes the execution with a
 * canned "shown" result, so the agent's turn completes without waiting on the
 * user. Tapping a chip sends its text verbatim as the user's next message.
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
  ClientToolDefinition,
} from "./types";

export const SUGGEST_REPLIES_TOOL_NAME = "suggest_replies";

/** Renderer cap — payloads beyond this are truncated with a console warning. */
export const SUGGEST_REPLIES_MAX = 4;

/**
 * JSON Schema for the tool's parameters. Mirrors what
 * {@link parseSuggestRepliesPayload} hydrates the chips from, so the schema
 * the model is held to and the shape the renderer expects can never drift.
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
      items: { type: "string", minLength: 1, maxLength: 60 },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

/**
 * The `ClientToolDefinition` shipped on `dispatch.clientTools[]` when
 * `features.suggestReplies.expose` is on. Exported so integrators who prefer
 * declaring the tool server-side (a flow's `runtimeTools`) can reuse the same
 * description and schema instead of hand-writing them.
 */
export const SUGGEST_REPLIES_CLIENT_TOOL: ClientToolDefinition = {
  name: SUGGEST_REPLIES_TOOL_NAME,
  description:
    "Offer the user tappable quick-reply suggestions for their next message. " +
    "Call at most once per turn, as the LAST action after your reply text is " +
    "complete. Each suggestion is sent verbatim as the user's next message, " +
    'so phrase suggestions in the user\'s voice (e.g. "Tell me more about ' +
    'pricing"). Keep them short and distinct. The result only confirms the ' +
    "suggestions were shown — do not add further commentary after calling " +
    "this tool; end your turn.",
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
 * Tolerant parse of a `suggest_replies` tool call's args into chip labels:
 * accepts a JSON string or object, coerces items to trimmed strings, drops
 * empties, and truncates past the renderer cap with a console warning.
 */
export const parseSuggestRepliesPayload = (args: unknown): string[] => {
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
  const chips = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (chips.length > SUGGEST_REPLIES_MAX) {
    console.warn(
      `[persona] suggest_replies: ${chips.length} suggestions exceeds the cap of ${SUGGEST_REPLIES_MAX}; extra suggestions dropped.`,
    );
    return chips.slice(0, SUGGEST_REPLIES_MAX);
  }
  return chips;
};

/**
 * The chips to show right now: those of the LAST `suggest_replies` tool
 * message with NO user message after it, or `null` when none apply. All
 * calls in a turn still get resumed (the server awaits each); only the
 * latest renders.
 */
export const latestAgentSuggestions = (
  messages: AgentWidgetMessage[],
): string[] | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") return null;
    if (!isSuggestRepliesMessage(message)) continue;
    const chips = parseSuggestRepliesPayload(message.toolCall?.args);
    return chips.length > 0 ? chips : null;
  }
  return null;
};

/**
 * Gate for advertising the tool: `expose` opts it into the agent's catalog,
 * and `enabled !== false` guarantees the widget will actually auto-resolve
 * and render chips for it — exposing the tool with the feature disabled
 * would park the execution on a generic tool bubble with no resume coming.
 */
export const shouldExposeSuggestReplies = (
  config: AgentWidgetConfig | undefined,
): boolean => {
  const feature = config?.features?.suggestReplies;
  return feature?.expose === true && feature.enabled !== false;
};
