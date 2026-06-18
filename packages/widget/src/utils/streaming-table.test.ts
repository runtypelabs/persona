import { describe, it, expect } from "vitest";
import { stabilizeStreamingTables } from "./streaming-table";
import { createMarkdownProcessor } from "../postprocessors";

describe("stabilizeStreamingTables", () => {
  it("leaves text without pipes untouched", () => {
    const md = "# Heading\n\nA paragraph with no tables.";
    expect(stabilizeStreamingTables(md)).toBe(md);
  });

  it("does not treat a header-only line as a table (no delimiter yet)", () => {
    // Ambiguous: could just be inline pipe text. Leave it alone until a
    // delimiter row starts streaming in.
    const md = "| Name | Price |";
    expect(stabilizeStreamingTables(md)).toBe(md);
  });

  it("completes a partial delimiter row so the table renders immediately", () => {
    const md = "| Name | Price |\n| --";
    expect(stabilizeStreamingTables(md)).toBe("| Name | Price |\n| --- | --- |");
  });

  it("completes a delimiter that is just a leading pipe with one dash", () => {
    const md = "| A | B | C |\n|-";
    expect(stabilizeStreamingTables(md)).toBe("| A | B | C |\n| --- | --- | --- |");
  });

  it("pads a partial trailing row to the header column count", () => {
    const md = "| Name | Price |\n| --- | --- |\n| Apple";
    expect(stabilizeStreamingTables(md)).toBe(
      "| Name | Price |\n| --- | --- |\n| Apple |  |"
    );
  });

  it("keeps a complete table stable (idempotent)", () => {
    const md = "| Name | Price |\n| --- | --- |\n| Apple | $1 |";
    expect(stabilizeStreamingTables(md)).toBe(md);
    expect(stabilizeStreamingTables(stabilizeStreamingTables(md))).toBe(md);
  });

  it("counts columns from a header without outer pipes", () => {
    const md = "Name | Price\n---";
    expect(stabilizeStreamingTables(md)).toBe("Name | Price\n| --- | --- |");
  });

  it("normalizes rows with extra cells down to the header column count", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 | 3 |";
    expect(stabilizeStreamingTables(md)).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("stops the table region at a blank line and leaves following text alone", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\nSome | trailing | text";
    expect(stabilizeStreamingTables(md)).toBe(md);
  });

  it("preserves leading prose before a streaming table", () => {
    const md = "Here you go:\n\n| A | B |\n| -";
    expect(stabilizeStreamingTables(md)).toBe("Here you go:\n\n| A | B |\n| --- | --- |");
  });

  it("handles two separate tables in one stream", () => {
    const md =
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\nmiddle\n\n| C | D | E |\n| --";
    expect(stabilizeStreamingTables(md)).toBe(
      "| A | B |\n| --- | --- |\n| 1 | 2 |\n\nmiddle\n\n| C | D | E |\n| --- | --- | --- |"
    );
  });

  it("preserves alignment-colon delimiters as a valid table start", () => {
    const md = "| A | B |\n| :-";
    // Detection accepts colons; the synthesized delimiter normalizes to dashes
    // (alignment reappears in the untouched final render).
    expect(stabilizeStreamingTables(md)).toBe("| A | B |\n| --- | --- |");
  });
});

describe("stabilizeStreamingTables → marked integration", () => {
  const md = createMarkdownProcessor();

  it("renders a <table> from a header + partial delimiter that marked alone would not", () => {
    const partial = "| Name | Price |\n| --";

    // Without stabilization marked sees no complete delimiter → no table.
    expect(md(partial)).not.toContain("<table");

    const html = md(stabilizeStreamingTables(partial));
    expect(html).toContain("<table");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<th>Price</th>");
  });

  it("renders a body row for a partial trailing row", () => {
    const partial = "| Name | Price |\n| --- | --- |\n| Apple";
    const html = md(stabilizeStreamingTables(partial));
    expect(html).toContain("<table");
    expect(html).toContain("<td>Apple</td>");
    // The padded empty cell keeps the column count stable.
    expect(html.match(/<td/g)?.length).toBe(2);
  });
});
