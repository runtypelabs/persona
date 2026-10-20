import type { AgentWidgetConfig } from "@runtypelabs/persona";

const labels = new Map([
  ["read_ticket", { active: "Reviewing conversation", complete: "Reviewed conversation" }],
  ["search_runbook", { active: "Searching guidance", complete: "Searched guidance" }],
  ["check_service_status", { active: "Checking service status", complete: "Checked service status" }],
]);

/** Only replace the label; Persona retains each row's disclosure and details. */
export const renderToolRow: NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderCollapsedSummary"]> = ({ toolCall, message }) => {
  const label = labels.get(toolCall.name ?? "");
  if (!label || toolCall.success === false || toolCall.error ||
    (toolCall.approvalStatus && toolCall.approvalStatus !== "approved") ||
    (message.approval && message.approval.status !== "approved")) return null;
  return label[toolCall.status === "complete" ? "complete" : "active"];
};
