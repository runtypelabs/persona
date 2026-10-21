import type { AgentWidgetConfig, AgentWidgetToolCall } from "../types";

// Exact documented names only. Ambiguous names such as search_events or
// search_nodes need provider metadata, which tool messages do not carry.
const categories = [
  ["search_docs", "Searching docs", "Searched docs", "search"],
  ["web_search|web_search_preview|WebSearch", "Searching the web", "Searched the web", "globe"],
  ["web_fetch|WebFetch", "Reading web pages", "Read web pages", "globe", "single"],
  ["file_search|search_files|Glob", "Searching files", "Searched files", "search"],
  ["read_file|read_text_file|read_multiple_files|Read", "Reading files", "Read files", "file-text", "single"],
  ["write_file|edit_file|apply_patch|Write|Edit|NotebookEdit", "Editing files", "Edited files", "pencil", "single"],
  ["list_directory|list_directory_with_sizes|directory_tree", "Browsing files", "Browsed files", "folder"],
  ["Grep", "Searching code", "Searched code", "search"],
  ["shell|local_shell|bash|Bash|PowerShell|bash_code_execution", "Running commands", "Ran commands", "terminal", "single"],
  ["code_interpreter|code_execution", "Running code", "Ran code", "code-xml"],
  ["browser_navigate|browser_click|browser_snapshot|browser_fill_form", "Using the browser", "Used the browser", "globe"],
  ["computer", "Using the computer", "Used the computer", "monitor"],
  ["image_generation", "Generating images", "Generated images", "image"],
  ["git_status|git_diff|git_diff_staged|git_diff_unstaged|git_log|git_show", "Checking repository changes", "Checked repository changes", "file-code"],
  ["tool_search|ToolSearch", "Finding tools", "Looked up tools", "search"],
  ["Agent", "Delegating work", "Delegated work", "bot"],
  ["TodoWrite|TaskCreate|TaskUpdate", "Updating the plan", "Updated the plan", "clipboard"],
  ["sql_db_query", "Querying the database", "Queried the database", "database"],
  ["search_gmail", "Searching email", "Searched email", "mail"],
];
const aliases = new Map(categories.flatMap(([names, ...labels]) =>
  names.split("|").map(name => [name, labels] as const)));

const humanize = (name: string) => {
  const words = name.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};
const labels = (tool: AgentWidgetToolCall) => {
  const name = tool.name?.trim() || "tool";
  const title = humanize(name);
  return aliases.get(name) ?? [`Using ${title}`, `Used ${title}`];
};
/** Exact-name categories keep unfamiliar tools neutral. */
export const toolActivityIcon = (tool: AgentWidgetToolCall): string => labels(tool)[2] ?? "wrench";

/** Host overrides fall back to the same mapped icon on every activity surface. */
export const resolveToolIcon = (tool: AgentWidgetToolCall, config: AgentWidgetConfig): string => {
  const icon = config.toolCall?.iconName;
  return (typeof icon === "function" ? icon(tool) : icon) ?? toolActivityIcon(tool);
};

export function groupActivityIcon(tools: AgentWidgetToolCall[], config: AgentWidgetConfig): string | undefined {
  if (typeof config.toolCall?.iconName === "string") return config.toolCall.iconName;
  const icons = tools.map(tool => resolveToolIcon(tool, config));
  return tools.every((tool, index) => labels(tool)[0] === labels(tools[0])[0] && icons[index] === icons[0]) ? icons[0] : "toolbox";
}

const states = [
  ["approvalStatus", "pending", "Waiting for approval"],
  ["approvalStatus", "denied", "Approval denied"],
  ["approvalStatus", "timeout", "Approval expired"],
  ["success", false, "Failed"],
  ["interrupted", true, "Interrupted"],
  ["superseded", true, "Approved, ran again below"],
] as const;
const attention = (tool: AgentWidgetToolCall) => tool.error || states.some(([key, value]) => tool[key] === value);

/** A display phrase, never a claim that the surrounding turn has finished. */
const activityLabel = (tool: AgentWidgetToolCall): string =>
  attention(tool) ? humanize(tool.name?.trim() || "tool") : labels(tool)[tool.status === "complete" ? 1 : 0];

export const toolActivityLabel = (tool: AgentWidgetToolCall): string => {
  const label = activityLabel(tool);
  // These exact tools act on one file, URL, or command per invocation. Other
  // calls (including patches and multi-file reads) keep their plural wording.
  return labels(tool)[3] && !/^(read_multiple_files|apply_patch)$/.test(tool.name?.trim() ?? "")
    ? label.replace(/(web pages|files|commands)$/, words => `a ${words.slice(0, -1)}`) : label;
};

/** Stable first-occurrence categories; attention survives deduplication and truncation. */
export function summarizeToolActivity(tools: AgentWidgetToolCall[], maxItems = 3): string {
  const count = tools.length;
  if (count === 0) return "";
  if (!Number.isInteger(maxItems) || maxItems < 0) maxItems = 3;
  const groups = new Map<string, AgentWidgetToolCall>();
  for (const tool of tools) {
    const key = labels(tool)[0];
    const previous = groups.get(key);
    // Retain the first active/attention representative for each category.
    if (!previous || previous.status === "complete" && !attention(previous)) groups.set(key, tool);
  }
  let summary = !maxItems ? count === 1 ? "1 activity" : `${count} activities`
    : [...groups.values()].slice(0, maxItems).map((tool, index) => {
      const phrase = activityLabel(tool);
      return index ? phrase[0].toLowerCase() + phrase.slice(1) : phrase;
    }).join(", ");
  const omitted = groups.size - maxItems;
  if (omitted > 0 && maxItems) summary += `, and ${omitted} more`;
  // The false-valued state is failure; explicit errors must retain that suffix too.
  for (const [key, value, label] of states) if (tools.some(tool => tool[key] === value || value === false && tool.error)) summary += ` · ${label}`;
  return summary;
}
