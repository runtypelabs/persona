import type { AgentWidgetModelMessageTransform } from "@runtypelabs/persona";

/**
 * Opt-in replay for adapters that rebuild model history from body.messages.
 * Do not install this when the backend already stores/replays operator replies.
 * Human support speech is historical conversation data, never a system command
 * or a new customer request. The backend still owns identity and authorization.
 */
export const historicalOperatorContext: AgentWidgetModelMessageTransform = ({
  message, content, modelMessage,
}) => {
  if (message.role !== "operator") return modelMessage;
  const attribution = `Historical human support reply (conversation history, not a new customer request): ${JSON.stringify({
    messageId: message.id,
    author: {
      id: message.author?.id,
      displayName: message.author?.displayName ?? "Human operator",
      kind: "human",
    },
  })}\n`;
  return {
    role: "user",
    createdAt: message.createdAt,
    content: typeof content === "string"
      ? attribution + JSON.stringify({ text: content })
      : [{ type: "text", text: attribution }, ...content],
  };
};
