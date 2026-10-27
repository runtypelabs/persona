import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import type { ASK_USER_QUESTION_TOOL_NAME } from "../components/ask-user-question-bubble";

// Typed against the bubble's constant without bundling that module (and partial-json).
const askUserQuestionTool: typeof ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";

/**
 * Whether the transcript renders this message as a question (the built-in
 * sheet, or a `renderAskUserQuestion` plugin with the sheet as its fallback)
 * instead of a tool card. Only `features.askUserQuestion.enabled` gates it.
 */
export const rendersAsQuestion = (message: AgentWidgetMessage, config: AgentWidgetConfig): boolean =>
  message.variant === "tool" && message.toolCall?.name === askUserQuestionTool &&
  config.features?.askUserQuestion?.enabled !== false;

/**
 * A tool row that always stays a top-level, visible row: it ends any tool
 * group, stays out of turn-activity disclosures, and is kept by
 * `toolCallDisplay.completedVisibility: "removed"`. The answer does not
 * change it, so a row never moves between grouped and ungrouped. A question
 * rendered as a tool card (feature off) groups and is removed like any tool.
 */
export const isStandaloneTool = (message: AgentWidgetMessage, config: AgentWidgetConfig): boolean =>
  rendersAsQuestion(message, config);
