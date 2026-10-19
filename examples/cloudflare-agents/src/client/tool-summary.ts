import type { AgentWidgetConfig } from "@runtypelabs/persona";

type GroupedSummary = NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderGroupedSummary"]>;
const labels = new Map([
  ["read_ticket", { active: "Reviewing conversation", complete: "Reviewed conversation" }],
  ["search_runbook", { active: "Searching guidance", complete: "Searched guidance" }],
  ["check_service_status", { active: "Checking service status", complete: "Checked service status" }],
]);

/** Keep unknown tools and attention states on Persona's built-in status labels. */
export const renderToolSummary: GroupedSummary = ({ toolCalls, messages }) => {
  if (!toolCalls.length || messages.some(message => message.approval && message.approval.status !== "approved")) return null;
  const groups = new Map<string, boolean>();
  for (const call of toolCalls) {
    const name = call.name ?? "";
    if (!labels.has(name) || call.success === false || call.error || (call.approvalStatus && call.approvalStatus !== "approved")) return null;
    groups.set(name, (groups.get(name) ?? false) || call.status !== "complete");
  }
  return [...groups].map(([name, active], index) => {
    const label = labels.get(name)![active ? "active" : "complete"];
    return index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1);
  }).join(", ");
};

/** Only replace the label; Persona retains each row's disclosure and details. */
export const renderToolRow: NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderCollapsedSummary"]> = ({ toolCall, message }) => {
  const label = labels.get(toolCall.name ?? "");
  if (!label || toolCall.success === false || toolCall.error ||
    (toolCall.approvalStatus && toolCall.approvalStatus !== "approved") ||
    (message.approval && message.approval.status !== "approved")) return null;
  return label[toolCall.status === "complete" ? "complete" : "active"];
};
