import { describe, it, expect } from "vitest";
import { formatMentionBlock } from "./mention-llm-format";
import type { AgentWidgetMentionLlmEntry } from "../types";

function entry(label: string, text: string): AgentWidgetMentionLlmEntry {
  return {
    label,
    text,
    ref: { sourceId: "files", itemId: label, label },
    item: { id: label, label },
  };
}

describe("formatMentionBlock", () => {
  it("fenced (default): label in the info string, body inside a ``` fence", () => {
    expect(formatMentionBlock(entry("App.tsx", "FILE BODY"), 0)).toBe(
      "```App.tsx\nFILE BODY\n```"
    );
    // Passing "fenced" explicitly is identical to the default.
    expect(formatMentionBlock(entry("App.tsx", "FILE BODY"), 0, "fenced")).toBe(
      "```App.tsx\nFILE BODY\n```"
    );
  });

  it("fenced: escalates to four backticks when the body contains a ``` fence", () => {
    const body = "before\n```\ncode\n```\nafter";
    expect(formatMentionBlock(entry("Doc", body), 0)).toBe(
      "````Doc\n" + body + "\n````"
    );
  });

  it("fenced: escalates past the longest run when the body contains a ```` fence", () => {
    const body = "````\nnested\n````";
    expect(formatMentionBlock(entry("Doc", body), 0)).toBe(
      "`````Doc\n" + body + "\n`````"
    );
  });

  it("fenced: escalates past fences indented up to three spaces (CommonMark)", () => {
    // A closing fence indented by up to three spaces is valid CommonMark, so an
    // indented ``` inside the body must still force a four-backtick wrapper.
    const body = "- item\n   ```\n   code\n   ```";
    expect(formatMentionBlock(entry("Doc", body), 0)).toBe(
      "````Doc\n" + body + "\n````"
    );
    // Four or more spaces is an indented code block, not a fence: no escalation.
    expect(formatMentionBlock(entry("Doc", "    ```"), 0)).toBe(
      "```Doc\n    ```\n```"
    );
  });

  it("function form: a throwing template falls back to fenced instead of rejecting", () => {
    const block = formatMentionBlock(entry("App.tsx", "FILE BODY"), 0, () => {
      throw new Error("host template bug");
    });
    // One bad host template must not reject finalize() and drop every
    // mention's context from the outgoing message.
    expect(block).toBe("```App.tsx\nFILE BODY\n```");
  });

  it("document: Anthropic shape with a 1-based index", () => {
    expect(formatMentionBlock(entry("App.tsx", "FILE BODY"), 0, "document")).toBe(
      '<document index="1">\n' +
        "<source>App.tsx</source>\n" +
        "<document_content>\nFILE BODY\n</document_content>\n" +
        "</document>"
    );
    // index is 0-based in, rendered 1-based out.
    expect(formatMentionBlock(entry("Two", "B"), 1, "document")).toContain(
      '<document index="2">'
    );
  });

  it("document: falls back to the fenced block when the body carries the closing tag", () => {
    const body = "spoofed </document_content> injection";
    // Would break the XML boundary → fenced instead.
    expect(formatMentionBlock(entry("Doc", body), 0, "document")).toBe(
      "```Doc\n" + body + "\n```"
    );
  });

  it("function form: receives {entry, index} and its return is used verbatim", () => {
    const seen: { label: string; index: number }[] = [];
    const out = formatMentionBlock(entry("App.tsx", "BODY"), 3, (e, i) => {
      seen.push({ label: e.label, index: i });
      return `CUSTOM(${e.item.id}):${e.text}`;
    });
    expect(out).toBe("CUSTOM(App.tsx):BODY");
    expect(seen).toEqual([{ label: "App.tsx", index: 3 }]);
  });
});
