/**
 * Built-in `ask_user_question` client tool.
 *
 * The widget can advertise this tool to the agent on every dispatch via
 * `clientTools[]` (set `features.askUserQuestion.expose: true`) — the same
 * wire surface WebMCP page tools ride. The server registers it as a LOCAL
 * tool under its bare name (`origin: 'sdk'` tools are not `webmcp:`-prefixed),
 * so when the model calls it the execution pauses with a `step_await`
 * (`awaitReason: "local_tool_required"`), the widget's answer-pill sheet
 * renders, and `session.resolveAskUserQuestion()` resumes the execution with
 * the structured answers.
 *
 * This replaces the previous integrator burden of hand-declaring the tool in
 * a flow's `runtimeTools` and keeping that schema in sync with the renderer.
 * Flows that already declare `ask_user_question` server-side should leave
 * `expose` off — the model would otherwise see the tool twice.
 */

import {
  ASK_USER_QUESTION_MAX,
  ASK_USER_QUESTION_TOOL_NAME,
} from "./components/ask-user-question-bubble";
import type { AgentWidgetConfig, ClientToolDefinition } from "./types";

/**
 * JSON Schema for the tool's parameters. Mirrors {@link AskUserQuestionPayload}
 * — the shape `parseAskUserQuestionPayload` hydrates the answer sheet from —
 * so the schema the model is held to and the schema the renderer expects can
 * never drift.
 */
export const ASK_USER_QUESTION_PARAMETERS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: ASK_USER_QUESTION_MAX,
      description: "Questions to ask the user. Prefer a single question.",
      items: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The complete question, ending with a question mark.",
          },
          header: {
            type: "string",
            maxLength: 12,
            description: 'Short topic label, e.g. "Auth method".',
          },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            description:
              '2-4 distinct choices. Do NOT add an "Other" option — free text is automatic.',
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "Concise choice text (1-5 words).",
                },
                description: {
                  type: "string",
                  description: "What the option means or implies.",
                },
              },
              required: ["label"],
              additionalProperties: false,
            },
          },
          multiSelect: {
            type: "boolean",
            description: "Allow selecting multiple options. Default false.",
          },
          allowFreeText: {
            type: "boolean",
            description: "Show a free-text input. Default true.",
          },
        },
        required: ["question", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

/**
 * The `ClientToolDefinition` shipped on `dispatch.clientTools[]` when
 * `features.askUserQuestion.expose` is on. Exported so integrators who prefer
 * declaring the tool server-side (a flow's `runtimeTools`) can reuse the same
 * description and schema instead of hand-writing them.
 */
export const ASK_USER_QUESTION_CLIENT_TOOL: ClientToolDefinition = {
  name: ASK_USER_QUESTION_TOOL_NAME,
  description:
    "Ask the user multiple-choice questions and wait for their answers. Use " +
    "only when blocked on a decision that is the user's to make — a " +
    "preference, a choice between valid approaches, or information you " +
    "cannot infer. Each question offers 2-4 options plus an automatic " +
    "free-text input. The result maps each question to its answer (an array " +
    "when multiSelect); a question absent from the result was skipped.",
  parametersSchema: ASK_USER_QUESTION_PARAMETERS_SCHEMA,
  origin: "sdk",
  annotations: { readOnlyHint: true },
};

/**
 * Built-in client tools to append to a dispatch's `clientTools[]` for the
 * given widget config. Today this is only `ask_user_question`; future built-in
 * local tools join here.
 *
 * Gated on BOTH flags: `expose` opts the tool into the agent's catalog, and
 * `enabled !== false` guarantees the widget can actually render an answer UI
 * for it — exposing a question tool with the sheet disabled would park the
 * execution on a generic tool bubble with no way to answer.
 */
export const builtInClientToolsForDispatch = (
  config: AgentWidgetConfig | undefined,
): ClientToolDefinition[] => {
  const feature = config?.features?.askUserQuestion;
  if (feature?.expose !== true || feature.enabled === false) return [];
  return [ASK_USER_QUESTION_CLIENT_TOOL];
};
