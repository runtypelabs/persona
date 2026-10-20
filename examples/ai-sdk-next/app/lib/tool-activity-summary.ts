import type { AgentWidgetConfig } from "@runtypelabs/persona";

type SummaryRenderer = NonNullable<
  NonNullable<AgentWidgetConfig["toolCall"]>["renderGroupedSummary"]
>;
type Category = "search" | "read" | "command" | "check";
type Label = string | ((callCount: number) => string);

// Replace these illustrative names with the exact names emitted by your adapter.
// This is application configuration, not a heuristic based on tool names.
const categories = new Map<string, Category>([
  ["search_docs", "search"],
  ["web_search", "search"],
  ["check_readiness", "check"],
  ["read_file", "read"],
  ["read_document", "read"],
  ["run_command", "command"],
]);
const labels: Record<Category, { running: Label; complete: Label }> = {
  check: { running: "Checking readiness", complete: "Checked readiness" },
  search: { running: "Searching", complete: "Searched" },
  read: { running: "Reading files", complete: "Read files" },
  command: { running: "Running commands", complete: "Ran commands" },
};

/** Optional, backend-independent recipe using Persona's existing hook. */
export const renderToolActivitySummary: SummaryRenderer = ({ toolCalls, messages }) => {
  // Let Persona retain its status summary for unknown tools and attention states.
  // Falling back for the whole group avoids hiding unknown calls from the label.
  if (!toolCalls.length || messages.some(message =>
    message.approval && message.approval.status !== "approved"
  )) return null;
  const groups = new Map<Category, { count: number; active: boolean }>();
  for (const tool of toolCalls) {
    const category = categories.get(tool.name ?? "");
    if (!category || tool.success === false || tool.error ||
      (tool.approvalStatus && tool.approvalStatus !== "approved")) return null;
    const group = groups.get(category) ?? { count: 0, active: false };
    group.count += 1;
    group.active ||= tool.status !== "complete";
    groups.set(category, group);
  }
  // Preserve first appearance order and show each category once.
  return Array.from(groups, ([category, group]) => {
    const label = labels[category][group.active ? "running" : "complete"];
    return typeof label === "function" ? label(group.count) : label;
  }).join(", ");
};
