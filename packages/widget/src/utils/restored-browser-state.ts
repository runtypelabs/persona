import type { AgentWidgetApproval, AgentWidgetMessage, AgentWidgetToolCall } from "../types";
import { isWebMcpToolName } from "../webmcp-bridge";

export const BROWSER_TOOL_INTERRUPTION =
  "The chat restarted and this browser tool was interrupted. Request a fresh proposal to try again.";

export function isBrowserLocalApproval(approval: AgentWidgetApproval): boolean {
  return approval.toolType === "webmcp" && !approval.executionId;
}

/** History cannot restore a browser callback. Server continuations stay live. */
export function restoreBrowserToolState(message: AgentWidgetMessage): AgentWidgetMessage {
  const approval = message.approval;
  // Server approvals can also name webmcp tools. An execution id identifies
  // their durable continuation; native browser gates have no execution id.
  const interruptedApproval = approval?.status === "pending" && isBrowserLocalApproval(approval);
  let hasBrowserTool = false;
  const settle = (tool: AgentWidgetToolCall): AgentWidgetToolCall => {
    if (!tool.name || !isWebMcpToolName(tool.name)) return tool;
    hasBrowserTool = true;
    // Older await frames used complete for the wire step before the browser
    // had executed anything. A recorded outcome, however, remains historical.
    const unfinished = tool.status !== "complete" ||
      (message.agentMetadata?.awaitingLocalTool === true &&
        tool.result === undefined && tool.success === undefined);
    if (!unfinished) return tool;
    return {
      ...tool,
      status: "complete",
      interrupted: true,
      success: false,
      error: BROWSER_TOOL_INTERRUPTION,
      approvalStatus: tool.approvalStatus === "pending" ? "interrupted" : tool.approvalStatus,
      // Retain recorded durations and paired timestamps. Never fabricate an
      // end timestamp or derive a duration from the time spent off the page.
      startedAt: tool.completedAt === undefined ? undefined : tool.startedAt,
    };
  };
  const toolCall = message.toolCall ? settle(message.toolCall) : undefined;
  const tools = message.tools?.map(settle);
  return {
    ...message,
    streaming: hasBrowserTool || interruptedApproval ? false : message.streaming,
    ...(interruptedApproval ? { approval: { ...approval, status: "interrupted" as const } } : {}),
    ...(toolCall ? { toolCall } : {}),
    ...(tools ? { tools } : {}),
    ...(hasBrowserTool && message.agentMetadata?.awaitingLocalTool
      ? { agentMetadata: { ...message.agentMetadata, awaitingLocalTool: false } } : {}),
  };
}
