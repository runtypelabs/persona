import { describe, expect, it } from "vitest";
import { renderToolActivitySummary } from "../app/lib/tool-activity-summary";

type Context = Parameters<typeof renderToolActivitySummary>[0];
const summarize = (toolCalls: Context["toolCalls"], messages: Context["messages"] = []) =>
  renderToolActivitySummary({ toolCalls, messages, defaultSummary: "Used tools", streaming: false, isLatestGroup: true, isCurrentRunGroup: true, config: {} });
const call = (name: string, status: "running" | "complete" = "complete") => ({ id: name, name, status });

describe("optional activity summary recipe", () => {
  it("deduplicates mapped categories in first appearance order", () => {
    expect(summarize([call("read_file"), call("run_command"), call("read_document")]))
      .toBe("Read files, Ran commands");
  });
  it("uses the running label only for categories with unfinished calls", () => {
    expect(summarize([call("read_file"), call("read_document", "running"), call("run_command")]))
      .toBe("Reading files, Ran commands");
  });
  it("falls back for unknown tools, empty groups, failures, and approval states", () => {
    expect(summarize([])).toBeNull();
    expect(summarize([call("read_file"), call("unknown")])).toBeNull();
    expect(summarize([{ ...call("run_command"), success: false }])).toBeNull();
    expect(summarize([{ ...call("read_file"), approvalStatus: "pending" }])).toBeNull();
    expect(summarize([{ ...call("read_file"), approvalStatus: "denied" }])).toBeNull();
  });
});
