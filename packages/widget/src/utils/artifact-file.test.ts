import { describe, it, expect } from "vitest";
import {
  extractFileSource,
  fileKindOf,
  fileTypeLabel,
  downloadInfoFor,
  basenameOf,
} from "./artifact-file";

// Canonical cross-repo fixture. The zero-width space is written as a
// backslash-u200b escape sequence (not a literal invisible char) so the bytes
// are unambiguous in source.
// Mirrors core/packages/shared/src/file-artifact.ts escapeFenceTerminators fixture — keep byte-identical.
const ZWSP = "\u200b";
const FIXTURE_RAW = "# Title\n\n```js\nconsole.log('hi')\n```\n";
const FIXTURE_ESCAPED =
  "# Title\n\n`" + ZWSP + "``js\nconsole.log('hi')\n`" + ZWSP + "``\n";
const FIXTURE_WIRE = "```md\n" + FIXTURE_ESCAPED + "\n```";

describe("extractFileSource", () => {
  it("round-trips the canonical cross-repo fixture byte-for-byte", () => {
    expect(extractFileSource(FIXTURE_WIRE)).toBe(FIXTURE_RAW);
  });

  it("passes through content without a leading fence unchanged", () => {
    const plain = "just some text\nwith lines\n";
    expect(extractFileSource(plain)).toBe(plain);
  });

  it("reverses multiple escaped fences", () => {
    const raw = "```a\n```b\n```c\n";
    const escaped = raw.split("```").join("`" + ZWSP + "``");
    const wire = "```md\n" + escaped + "\n```";
    expect(extractFileSource(wire)).toBe(raw);
  });

  it("unfences a simple html file", () => {
    const raw = "<h1>hi</h1>\n";
    const wire = "```html\n" + raw + "\n```";
    expect(extractFileSource(wire)).toBe(raw);
  });

  it("handles empty file content", () => {
    const wire = "```md\n\n```";
    expect(extractFileSource(wire)).toBe("");
  });

  it("returns empty string for non-string input", () => {
    // @ts-expect-error deliberate misuse
    expect(extractFileSource(undefined)).toBe("");
  });
});

describe("fileKindOf", () => {
  it("classifies by extension", () => {
    expect(fileKindOf({ path: "a/cat.html", mimeType: "text/html" })).toBe("html");
    expect(fileKindOf({ path: "cat.htm", mimeType: "text/html" })).toBe("html");
    expect(fileKindOf({ path: "logo.svg", mimeType: "image/svg+xml" })).toBe("svg");
    expect(fileKindOf({ path: "notes.md", mimeType: "text/markdown" })).toBe("markdown");
    expect(fileKindOf({ path: "notes.mdx", mimeType: "text/markdown" })).toBe("markdown");
    expect(fileKindOf({ path: "data.json", mimeType: "application/json" })).toBe("other");
  });

  it("falls back to mimeType when there is no extension", () => {
    expect(fileKindOf({ path: "README", mimeType: "text/html" })).toBe("html");
    expect(fileKindOf({ path: "drawing", mimeType: "image/svg+xml" })).toBe("svg");
    expect(fileKindOf({ path: "doc", mimeType: "text/markdown" })).toBe("markdown");
    expect(fileKindOf({ path: "blob", mimeType: "application/octet-stream" })).toBe("other");
  });
});

describe("fileTypeLabel", () => {
  it("produces human labels", () => {
    expect(fileTypeLabel({ path: "cat.html", mimeType: "text/html" })).toBe("HTML");
    expect(fileTypeLabel({ path: "logo.svg", mimeType: "image/svg+xml" })).toBe("SVG");
    expect(fileTypeLabel({ path: "notes.md", mimeType: "text/markdown" })).toBe("Markdown");
    expect(fileTypeLabel({ path: "data.csv", mimeType: "text/csv" })).toBe("CSV");
    expect(fileTypeLabel({ path: "blob", mimeType: "application/octet-stream" })).toBe("File");
  });
});

describe("basenameOf", () => {
  it("returns the last path segment", () => {
    expect(basenameOf("/mnt/session/outputs/cat.html")).toBe("cat.html");
    expect(basenameOf("cat.html")).toBe("cat.html");
    expect(basenameOf("a\\b\\c.txt")).toBe("c.txt");
  });
});

describe("downloadInfoFor", () => {
  it("uses basename + real MIME + unfenced source for file records", () => {
    const info = downloadInfoFor({
      title: "outputs/cat.html",
      markdown: "```html\n<h1>hi</h1>\n\n```",
      file: { path: "outputs/cat.html", mimeType: "text/html" },
    });
    expect(info.filename).toBe("cat.html");
    expect(info.mime).toBe("text/html");
    expect(info.content).toBe("<h1>hi</h1>\n");
  });

  it("preserves legacy .md / text/markdown behavior for non-file records", () => {
    const info = downloadInfoFor({
      title: "My Doc",
      markdown: "## Hello\n\nbody",
    });
    expect(info.filename).toBe("My Doc.md");
    expect(info.mime).toBe("text/markdown");
    expect(info.content).toBe("## Hello\n\nbody");
  });

  it("defaults filename for a titleless non-file record", () => {
    const info = downloadInfoFor({ markdown: "x" });
    expect(info.filename).toBe("artifact.md");
  });
});
