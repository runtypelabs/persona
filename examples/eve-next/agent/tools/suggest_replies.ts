import { defineTool } from "eve/tools";

// The filename is the model-facing tool name, so this file *is* `suggest_replies`:
// the name Persona's widget looks for when it renders quick-reply chips.
// `inputSchema` is plain JSON Schema (eve accepts it alongside Zod), copied from
// the widget's SUGGEST_REPLIES_PARAMETERS_SCHEMA so the example stays zero-dep.
export default defineTool({
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
  inputSchema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        minItems: 1,
        maxItems: 4,
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
  },
  // The widget renders the chips off the tool call itself, so the handler only
  // has to close the loop for the model.
  execute() {
    return { content: [{ type: "text", text: "Suggestions shown to the user." }] };
  },
});
