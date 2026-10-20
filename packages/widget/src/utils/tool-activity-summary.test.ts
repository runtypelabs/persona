import { describe, expect, it } from "vitest";
import type { AgentWidgetToolCall } from "../types";
import { summarizeToolActivity, toolActivityLabel, toolActivityIcon, groupActivityIcon, resolveToolIcon } from "./tool-activity-summary";

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

  it("preserves unknown tool title casing after the first category", () => {
    expect(summarizeToolActivity([tool("Read"), tool("lookup_order_status")])).toBe("Read files, used Lookup order status");
  });

  it("humanizes unknown snake/camel names without inspecting arguments or results", () => {
    expect(toolActivityLabel(tool("lookup_order_status"))).toBe("Used Lookup order status");
    expect(toolActivityLabel(tool("lookupOrderStatus", { status: "running", args: "web_search", result: "success" }))).toBe("Using Lookup order status");
    expect(toolActivityLabel(tool("Bash", { args: { command: "git status" } }))).toBe("Ran a command");
  });

  it("deduplicates categories in first-occurrence order using actual activity state", () => {
    const tools = [tool("Read"), tool("read_text_file"), tool("Bash", { status: "running" }), tool("Edit")];
    expect(summarizeToolActivity(tools)).toBe("Read files, running commands, edited files");
    expect(summarizeToolActivity([tool("web_search"), tool("WebSearch")])).toBe("Searched the web");
    expect(summarizeToolActivity([tool("Read"), tool("Read", { status: "pending" })])).toBe("Reading files");
  });

  it("uses plural action phrasing for homogeneous headers without guessing entity counts from args", () => {
    const searches = Array.from({ length: 5 }, () => tool("web_search", { args: { query: "ignored" } }));
    expect(summarizeToolActivity(searches)).toBe("Searched the web");
    expect(toolActivityLabel(searches[0])).toBe("Searched the web");
    expect(summarizeToolActivity([tool("Read"), tool("Bash")])).toBe("Read files, ran commands");
    expect(toolActivityLabel(tool("Read", { status: "running" }))).toBe("Reading a file");
    expect(toolActivityLabel(tool("read_multiple_files"))).toBe("Read files");
    expect(toolActivityLabel(tool("apply_patch"))).toBe("Edited files");
    expect(summarizeToolActivity([tool("lookup_order"), tool("lookup_order")])).toBe("Used Lookup order");
  });

  it.each([
    ["Read", "Read files", "Reading files"],
    ["Bash", "Ran commands", "Running commands"],
    ["web_search", "Searched the web", "Searching the web"],
    ["Edit", "Edited files", "Editing files"],
    ["lookup_order", "Used Lookup order", "Using Lookup order"],
  ])("keeps homogeneous %s action phrasing at every positive cap", (name, completed, active) => {
    for (const limit of [1, 2, 3, 8]) {
      expect(summarizeToolActivity([tool(name), tool(name)], limit)).toBe(completed);
      expect(summarizeToolActivity([tool(name), tool(name, { status: "running" })], limit)).toBe(active);
      expect(summarizeToolActivity([tool(name, { status: "pending" }), tool(name)], limit)).toBe(active);
    }
    expect(summarizeToolActivity([tool(name), tool(name)], 0)).toBe("2 activities");
  });

  it.each([
    [0, "5 activities"], [1, "Read files, and 3 more"],
    [2, "Read files, ran commands, and 2 more"],
    [3, "Read files, ran commands, edited files, and 1 more"],
    [4, "Read files, ran commands, edited files, searched the web"],
    [20, "Read files, ran commands, edited files, searched the web"],
  ])("caps distinct categories at %s for completed and active batches", (limit, expected) => {
    const tools = [tool("Read"), tool("read_text_file"), tool("Bash"), tool("Edit"), tool("web_search")];
    expect(summarizeToolActivity(tools, limit)).toBe(expected);
    tools[4].status = "running";
    expect(summarizeToolActivity(tools, limit)).toBe(expected.replace("searched the web", "searching the web"));
  });

  it("uses an explicit zero for all aggregate counts, including homogeneous groups and singletons", () => {
    expect(summarizeToolActivity([tool("Read"), tool("Read")], 0)).toBe("2 activities");
    expect(summarizeToolActivity([tool("Read")], 0)).toBe("1 activity");
    expect(summarizeToolActivity([], 0)).toBe("");
    expect(summarizeToolActivity(Array.from({length: 10}, () => tool("Read")).concat([tool("Bash"), tool("Bash")]), 1)).toBe("Read files, and 1 more");
    expect(summarizeToolActivity(Array.from({length: 5}, () => tool("Read")), 1)).toBe("Read files");
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity])("falls back to three categories for invalid limit %s", limit => {
    const tools = [tool("Read"), tool("Bash"), tool("Edit"), tool("web_search")];
    expect(summarizeToolActivity(tools, limit)).toBe(summarizeToolActivity(tools));
  });

  it("retains neutral labels and all attention states in homogeneous groups", () => {
    expect(summarizeToolActivity([tool("web_search"), tool("WebSearch", { success: false })])).toBe("Web search · Failed");
    expect(summarizeToolActivity([tool("Read", { approvalStatus: "pending" }), tool("Read", { approvalStatus: "denied" })])).toBe("Read · Waiting for approval · Approval denied");
    expect(toolActivityLabel(tool("Read", { success: false }))).toBe("Read");
  });

  it("caps categories while preserving every kind of attention outside the cap", () => {
    const tools = [tool("Read"), tool("Bash"), tool("Edit"), tool("web_search", { success: false }),
      tool("computer", { interrupted: true }), tool("Agent", { approvalStatus: "pending" }),
      tool("Grep", { approvalStatus: "denied" }), tool("sql_db_query", { approvalStatus: "timeout" })];
    expect(summarizeToolActivity(tools)).toBe("Read files, ran commands, edited files, and 5 more · Waiting for approval · Approval denied · Approval expired · Failed · Interrupted");
    expect(summarizeToolActivity(tools, 0)).toBe("8 activities · Waiting for approval · Approval denied · Approval expired · Failed · Interrupted");
    expect(summarizeToolActivity([tool("Read", { superseded: true })], 0)).toBe("1 activity · Approved, ran again below");
    expect(summarizeToolActivity(tools.slice(0, 4))).toContain("1 more · Failed");
  });

  it("keeps error-only failures visible once in count-only and truncated summaries", () => {
    const tools = [tool("Read"), tool("Bash", { error: "Command failed" })];
    expect(summarizeToolActivity(tools, 0)).toBe("2 activities · Failed");
    expect(summarizeToolActivity(tools, 1)).toBe("Read files, and 1 more · Failed");
    expect(summarizeToolActivity([tool("Bash", { error: "Command failed", success: false })], 0)).toBe("1 activity · Failed");
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
   ["sql_db_query", "database"], ["search_events", "wrench"], ["my_web_search", "wrench"],
 ])("maps the completed icon for %s without guessing", (name, icon) => expect(toolActivityIcon(tool(name))).toBe(icon));

 it("keeps homogeneous group icons and uses toolbox for mixed categories", () => {
   const config = {};
   expect(groupActivityIcon([tool("web_search"), tool("WebSearch")], config)).toBe("globe");
   expect(groupActivityIcon([tool("web_search"), tool("Read")], config)).toBe("toolbox");
   expect(groupActivityIcon([tool("web_search"), tool("web_fetch")], config)).toBe("toolbox");
   expect(groupActivityIcon([tool("lookup_order"), tool("lookup_order")], config)).toBe("wrench");
   expect(groupActivityIcon([], config)).toBeUndefined();
 });

 it("keeps custom icon overrides and neutral unknown-tool groups", () => {
   const tools = [tool("lookup_order"), tool("read_graph")];
   expect(groupActivityIcon(tools, { toolCall: { iconName: toolActivityIcon } })).toBe("toolbox");
   expect(groupActivityIcon(tools, { toolCall: { iconName: "check" } })).toBe("check");
   expect(groupActivityIcon([tool("Read"), tool("read_text_file")], { toolCall: { iconName: () => "pencil" } })).toBe("pencil");
   expect(groupActivityIcon([tool("web_search"), tool("Read")], { toolCall: { iconName: () => "pencil" } })).toBe("toolbox");
   expect(groupActivityIcon([tool("Read"), tool("read_text_file")], { toolCall: { iconName: () => undefined } })).toBe("file-text");
 });

 it("resolves mapped defaults, callback fallbacks and explicit checks consistently", () => {
   expect(resolveToolIcon(tool("Read"), {})).toBe("file-text");
   expect(resolveToolIcon(tool("lookup"), {})).toBe("wrench");
   expect(resolveToolIcon(tool("Read"), { toolCall: { iconName: () => undefined } })).toBe("file-text");
   expect(resolveToolIcon(tool("Read"), { toolCall: { iconName: "check" } })).toBe("check");
   expect(resolveToolIcon(tool("Read"), { toolCall: { iconName: () => "check" } })).toBe("check");
 });
