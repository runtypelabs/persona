import { describe, expect, it } from "vitest";
import type { AgentWidgetToolCall } from "../types";
import { summarizeToolActivity, toolActivityLabel, toolActivityIcon, groupActivityIcon } from "./tool-activity-summary";

const tool = (name: string, extra: Partial<AgentWidgetToolCall> = {}): AgentWidgetToolCall => ({ id: name, name, status: "complete", ...extra });

describe("semantic tool activity", () => {
  it.each([
    ["web_search", "Searched the web"], ["web_search_preview", "Searched the web"], ["WebSearch", "Searched the web"],
    ["web_fetch", "Read a web page"], ["WebFetch", "Read a web page"],
    ["file_search", "Searched files"], ["search_files", "Searched files"], ["Glob", "Searched files"],
    ["read_text_file", "Read a file"], ["read_multiple_files", "Read files"], ["Read", "Read a file"],
    ["write_file", "Edited a file"], ["edit_file", "Edited a file"], ["apply_patch", "Edited files"], ["Write", "Edited a file"], ["Edit", "Edited a file"], ["NotebookEdit", "Edited a file"],
    ["list_directory", "Browsed files"], ["list_directory_with_sizes", "Browsed files"], ["directory_tree", "Browsed files"],
    ["Grep", "Searched code"], ["shell", "Ran a command"], ["local_shell", "Ran a command"], ["bash", "Ran a command"], ["Bash", "Ran a command"], ["PowerShell", "Ran a command"], ["bash_code_execution", "Ran a command"],
    ["code_interpreter", "Ran code"], ["code_execution", "Ran code"],
    ["browser_navigate", "Used the browser"], ["browser_click", "Used the browser"], ["browser_snapshot", "Used the browser"], ["browser_fill_form", "Used the browser"],
    ["computer", "Used the computer"], ["image_generation", "Generated images"],
    ["git_status", "Checked repository changes"], ["git_diff", "Checked repository changes"], ["git_diff_staged", "Checked repository changes"], ["git_diff_unstaged", "Checked repository changes"], ["git_log", "Checked repository changes"], ["git_show", "Checked repository changes"],
    ["tool_search", "Looked up tools"], ["ToolSearch", "Looked up tools"], ["Agent", "Delegated work"],
    ["TodoWrite", "Updated the plan"], ["TaskCreate", "Updated the plan"], ["TaskUpdate", "Updated the plan"],
    ["sql_db_query", "Queried the database"], ["search_gmail", "Searched email"],
  ])("maps exact alias %s", (name, label) => expect(toolActivityLabel(tool(name))).toBe(label));

  it.each(["search_events", "search_nodes", "read_graph", "open_nodes", "read", "search", "git_commit", "my_web_search", "web_search_custom"])("keeps ambiguous %s generic", name => {
    expect(toolActivityLabel(tool(name))).toMatch(/^Used /);
  });

  it("humanizes unknown snake/camel names without inspecting arguments or results", () => {
    expect(toolActivityLabel(tool("lookup_order_status"))).toBe("Used Lookup order status");
    expect(toolActivityLabel(tool("lookupOrderStatus", { status: "running", args: "web_search", result: "success" }))).toBe("Using Lookup order status");
    expect(toolActivityLabel(tool("Bash", { args: { command: "git status" } }))).toBe("Ran a command");
  });

  it("deduplicates categories in first-occurrence order using actual activity state", () => {
    const tools = [tool("Read"), tool("read_text_file"), tool("Bash", { status: "running" }), tool("Edit")];
    expect(summarizeToolActivity(tools)).toBe("Read files, running commands, edited files");
    expect(summarizeToolActivity([tool("web_search"), tool("WebSearch")])).toBe("Web searches (2)");
    expect(summarizeToolActivity([tool("Read"), tool("Read", { status: "pending" })])).toBe("File reads (2)");
  });

  it("distinguishes homogeneous headers from child labels without guessing from args", () => {
    const searches = Array.from({ length: 5 }, () => tool("web_search", { args: { query: "ignored" } }));
    expect(summarizeToolActivity(searches)).toBe("Web searches (5)");
    expect(toolActivityLabel(searches[0])).toBe("Searched the web");
    expect(summarizeToolActivity([tool("Read"), tool("Bash")])).toBe("Read files, ran commands");
    expect(toolActivityLabel(tool("Read", { status: "running" }))).toBe("Reading a file");
    expect(toolActivityLabel(tool("read_multiple_files"))).toBe("Read files");
    expect(toolActivityLabel(tool("apply_patch"))).toBe("Edited files");
    expect(summarizeToolActivity([tool("lookup_order"), tool("lookup_order")])).toBe("Lookup order (2)");
  });

  it("retains all attention states in counted homogeneous groups", () => {
    expect(summarizeToolActivity([tool("web_search"), tool("WebSearch", { success: false })])).toBe("Web searches (2) · Failed");
    expect(summarizeToolActivity([tool("Read", { approvalStatus: "pending" }), tool("Read", { approvalStatus: "denied" })])).toBe("File reads (2) · Waiting for approval · Approval denied");
    expect(toolActivityLabel(tool("Read", { success: false }))).toBe("Read");
  });

  it("caps categories while preserving every kind of attention outside the cap", () => {
    const tools = [tool("Read"), tool("Bash"), tool("Edit"), tool("web_search", { success: false }),
      tool("computer", { interrupted: true }), tool("Agent", { approvalStatus: "pending" }),
      tool("Grep", { approvalStatus: "denied" }), tool("sql_db_query", { approvalStatus: "timeout" })];
    expect(summarizeToolActivity(tools)).toBe("Read files, ran commands, edited files, and 5 other activities · Waiting for approval · Approval denied · Approval expired · Failed · Interrupted");
    expect(summarizeToolActivity(tools.slice(0, 4))).toContain("1 other activity · Failed");
  });

  it("does not describe failed, interrupted, or unapproved actions as completed", () => {
    expect(summarizeToolActivity([tool("Edit", { success: false })])).toBe("Edit · Failed");
    expect(summarizeToolActivity([tool("Edit", { interrupted: true })])).toBe("Edit · Interrupted");
    expect(summarizeToolActivity([tool("Edit", { approvalStatus: "pending" })])).toBe("Edit · Waiting for approval");
    expect(summarizeToolActivity([tool("Edit", { approvalStatus: "approved", superseded: true })])).toBe("Edit · Approved, ran again below");
  });
});

 it.each([
   ["web_search", "globe"], ["Read", "file-text"], ["edit_file", "pencil"], ["Bash", "terminal"],
   ["sql_db_query", "database"], ["search_events", "square-text"], ["my_web_search", "square-text"],
 ])("maps the completed icon for %s without guessing", (name, icon) => expect(toolActivityIcon(tool(name))).toBe(icon));

 it("keeps homogeneous group icons and uses square-text for mixed categories", () => {
   const config = { toolCall: { iconName: toolActivityIcon } };
   expect(groupActivityIcon([tool("web_search"), tool("WebSearch")], config)).toBe("globe");
   expect(groupActivityIcon([tool("web_search"), tool("Read")], config)).toBe("square-text");
   expect(groupActivityIcon([tool("web_search"), tool("web_fetch")], config)).toBe("square-text");
   expect(groupActivityIcon([tool("web_search"), tool("Read")], {})).toBeUndefined();
 });

 it("keeps custom icon overrides and neutral unknown-tool groups", () => {
   const tools = [tool("lookup_order"), tool("read_graph")];
   expect(groupActivityIcon(tools, { toolCall: { iconName: toolActivityIcon } })).toBe("square-text");
   expect(groupActivityIcon(tools, { toolCall: { iconName: "check" } })).toBe("check");
   expect(groupActivityIcon([tool("Read"), tool("read_text_file")], { toolCall: { iconName: () => "pencil" } })).toBe("pencil");
 });
