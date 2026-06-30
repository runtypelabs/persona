import { describe, it, expect } from "vitest";
import {
  createJsonStreamParser,
  createFlexibleJsonStreamParser,
  extractTextFromJson,
  formatUnknownValue,
} from "./formatting";
import type { AgentWidgetStreamParser } from "../types";

/**
 * Record-type validation hardening suite.
 *
 * The structured-output stream parsers in `formatting.ts` consume JSON
 * "records" emitted by an agent and extract the human-visible `text` field
 * while a record streams in (the partial-json completion path). A regression
 * here surfaces as: a record whose *sibling* fields hold some particular data
 * type (a number, a nested object, a boolean, `null`, an array, …) breaks
 * parsing and the user's text silently disappears or the parser throws.
 *
 * These tests pin the behaviour across the full matrix of JSON value types a
 * record can carry, in both the complete and the incremental/streaming case,
 * so that any future parser or dependency change (e.g. a `partial-json` bump)
 * that re-introduces a type-sensitive parse failure is caught immediately.
 */

// The stream parsers may return a string, an object with a `text` field, null,
// or (for the async variants) a Promise. The JSON parsers used here are
// synchronous; normalise their result down to the extracted text.
const readText = (
  result: ReturnType<AgentWidgetStreamParser["processChunk"]>
): string | null => {
  const r = result as Exclude<typeof result, Promise<unknown>>;
  if (r === null) return null;
  return typeof r === "string" ? r : r?.text ?? null;
};

const parseComplete = (
  make: () => AgentWidgetStreamParser,
  record: unknown
): string | null => readText(make().processChunk(JSON.stringify(record)));

// Feed a JSON string into a fresh parser one code point at a time, mirroring
// how an SSE stream accumulates. Returns the final extracted text and asserts
// that no chunk along the way threw.
const streamCodePointByCodePoint = (
  make: () => AgentWidgetStreamParser,
  full: string
): string | null => {
  const parser = make();
  let accumulated = "";
  for (const ch of Array.from(full)) {
    accumulated += ch;
    // A throw here fails the test — the parser must tolerate every prefix.
    parser.processChunk(accumulated);
  }
  return parser.getExtractedText();
};

/**
 * The matrix of data types a record field can hold. Extend this list when a
 * new shape of value starts flowing through records — every test below will
 * automatically exercise it.
 */
const RECORD_VALUE_TYPES: Array<{ name: string; value: unknown }> = [
  { name: "string", value: "world" },
  { name: "empty string", value: "" },
  { name: "string with quotes", value: 'a "quoted" value' },
  { name: "unicode string", value: "héllo 😀 ✓ ☃" },
  { name: "integer", value: 42 },
  { name: "negative integer", value: -7 },
  { name: "zero", value: 0 },
  { name: "float", value: 3.14159 },
  { name: "large/exponent number", value: 1e21 },
  { name: "boolean true", value: true },
  { name: "boolean false", value: false },
  { name: "null", value: null },
  { name: "empty object", value: {} },
  { name: "empty array", value: [] },
  { name: "flat object", value: { a: 1, b: "two" } },
  { name: "mixed array", value: [1, "two", false, null, { k: "v" }] },
  {
    name: "deeply nested",
    value: { a: { b: { c: { d: [1, { e: true }, [2, 3]] } } } },
  },
];

describe("record-type validation: sibling field types (complete JSON)", () => {
  for (const { name, value } of RECORD_VALUE_TYPES) {
    it(`extracts text when a sibling field is ${name} (json parser)`, () => {
      expect(parseComplete(createJsonStreamParser, { text: "hello", value })).toBe(
        "hello"
      );
    });

    it(`extracts text when a sibling field is ${name} (flexible parser)`, () => {
      expect(
        parseComplete(createFlexibleJsonStreamParser, { text: "hello", value })
      ).toBe("hello");
    });

    it(`extracts text when a sibling field is ${name} (extractTextFromJson)`, () => {
      expect(extractTextFromJson(JSON.stringify({ text: "hello", value }))).toBe(
        "hello"
      );
    });
  }
});

describe("record-type validation: sibling field types (incremental streaming)", () => {
  for (const { name, value } of RECORD_VALUE_TYPES) {
    it(`extracts text mid-stream when a sibling field is ${name} (json parser)`, () => {
      const json = JSON.stringify({ text: "hello", value });
      expect(streamCodePointByCodePoint(createJsonStreamParser, json)).toBe(
        "hello"
      );
    });

    it(`extracts text mid-stream when a sibling field is ${name} (flexible parser)`, () => {
      const json = JSON.stringify({ text: "hello", value });
      expect(
        streamCodePointByCodePoint(createFlexibleJsonStreamParser, json)
      ).toBe("hello");
    });
  }
});

describe("record-type validation: field ordering is irrelevant", () => {
  for (const { name, value } of RECORD_VALUE_TYPES) {
    it(`extracts text when a ${name} sibling precedes text (json parser)`, () => {
      // Value first, text second — partial-json must reach the trailing text.
      expect(parseComplete(createJsonStreamParser, { value, text: "hello" })).toBe(
        "hello"
      );
    });

    it(`extracts text when a ${name} sibling precedes text (streaming)`, () => {
      const json = JSON.stringify({ value, text: "hello" });
      expect(streamCodePointByCodePoint(createJsonStreamParser, json)).toBe(
        "hello"
      );
    });
  }
});

describe("record-type validation: text field content", () => {
  // Realistic LLM text payloads that must round-trip exactly through parse +
  // unescape, regardless of a sibling numeric field.
  const CLEAN_TEXTS: Array<{ name: string; text: string }> = [
    { name: "plain", text: "Hello world" },
    { name: "empty", text: "" },
    { name: "newline", text: "line1\nline2" },
    { name: "tab", text: "col1\tcol2" },
    { name: "carriage return", text: "a\r\nb" },
    { name: "double quotes", text: 'she said "hi"' },
    { name: "unicode + symbols", text: "héllo 😀 ✓ ☃ — ñ" },
    { name: "emoji ZWJ sequence", text: "family: 👨‍👩‍👧‍👦" },
    { name: "very long", text: "x".repeat(5000) },
  ];

  for (const { name, text } of CLEAN_TEXTS) {
    it(`round-trips ${name} text exactly (complete)`, () => {
      expect(parseComplete(createJsonStreamParser, { text, n: 1 })).toBe(text);
    });

    it(`round-trips ${name} text exactly (streaming)`, () => {
      const json = JSON.stringify({ text, n: 1 });
      expect(streamCodePointByCodePoint(createJsonStreamParser, json)).toBe(text);
    });
  }

  it("normalizes backslash escape sequences in text (documented unescape behavior)", () => {
    // The parser deliberately unescapes sequences that LLMs commonly
    // double-escape, so a literal backslash-n in the source value becomes a
    // newline. This pins that intentional transformation so a change is caught.
    // Source value is the 4 chars: a \ n b
    expect(parseComplete(createJsonStreamParser, { text: "a\\nb", n: 1 })).toBe(
      "a\nb"
    );
  });
});

describe("record-type validation: non-string text field", () => {
  // When `text` itself is not a string, the parsers must not throw and must
  // report no extracted text (callers fall back to raw/plain rendering).
  const NON_STRING_TEXTS: Array<{ name: string; value: unknown }> = [
    { name: "number", value: 42 },
    { name: "boolean", value: true },
    { name: "null", value: null },
    { name: "object", value: { a: 1 } },
    { name: "array", value: [1, 2, 3] },
  ];

  for (const { name, value } of NON_STRING_TEXTS) {
    it(`does not extract text when text is a ${name} (json parser)`, () => {
      const parser = createJsonStreamParser();
      expect(() => parser.processChunk(JSON.stringify({ text: value }))).not.toThrow();
      expect(parser.getExtractedText()).toBeNull();
    });

    it(`does not crash when text is a ${name} (extractTextFromJson)`, () => {
      expect(extractTextFromJson(JSON.stringify({ text: value }))).toBeNull();
    });
  }
});

describe("record-type validation: directive records", () => {
  it("component directive without text yields empty text but preserves raw", () => {
    const record = { component: "ProductCard", props: { id: "p1", price: 9.99 } };
    const result = createJsonStreamParser().processChunk(JSON.stringify(record));
    const obj = result as { text: string; raw: string };
    expect(obj.text).toBe("");
    expect(JSON.parse(obj.raw)).toEqual(record);
  });

  it("component directive with text extracts the text", () => {
    expect(
      parseComplete(createJsonStreamParser, {
        component: "Card",
        text: "here you go",
        props: {},
      })
    ).toBe("here you go");
  });

  it("form init directive yields empty text", () => {
    expect(
      parseComplete(createJsonStreamParser, {
        type: "init",
        form: { fields: [{ name: "email", type: "string" }] },
      })
    ).toBe("");
  });

  // Wire records carry snake_case field names; express them as raw JSON
  // strings (their on-the-wire form) and read the extracted text directly.
  const flexText = (json: string): string | null =>
    readText(createFlexibleJsonStreamParser().processChunk(json));

  it("flexible parser resolves action-based text fields", () => {
    expect(flexText('{"action":"message","text":"hi"}')).toBe("hi");
    expect(
      flexText('{"action":"nav_then_click","on_load_text":"loading…","text":"ignored"}')
    ).toBe("loading…");
    expect(flexText('{"action":"custom","display_text":"shown"}')).toBe("shown");
  });

  it("flexible parser falls back across common text field names", () => {
    expect(flexText('{"display_text":"d"}')).toBe("d");
    expect(flexText('{"message":"m"}')).toBe("m");
    expect(flexText('{"content":"c"}')).toBe("c");
  });
});

describe("record-type validation: malformed / non-record input", () => {
  const NON_RECORDS = ["plain text", "   ", "<text>x</text>", "hello {not json}"];
  for (const input of NON_RECORDS) {
    it(`returns null for non-JSON input: ${JSON.stringify(input)}`, () => {
      const parser = createJsonStreamParser();
      expect(readText(parser.processChunk(input))).toBeNull();
      expect(extractTextFromJson(input)).toBeNull();
    });
  }

  it("returns null for a top-level array and a top-level string", () => {
    expect(extractTextFromJson("[1,2,3]")).toBeNull();
    expect(extractTextFromJson('"just a string"')).toBeNull();
  });

  it("does not extract from a record with no text-bearing field", () => {
    expect(parseComplete(createJsonStreamParser, { foo: "bar", n: 1 })).toBeNull();
  });
});

describe("record-type validation: formatUnknownValue across data types", () => {
  const CASES: Array<{ name: string; value: unknown; expected: string }> = [
    { name: "string", value: "hello", expected: "hello" },
    { name: "empty string", value: "", expected: "" },
    { name: "integer", value: 42, expected: "42" },
    { name: "negative", value: -7, expected: "-7" },
    { name: "zero", value: 0, expected: "0" },
    { name: "float", value: 3.14, expected: "3.14" },
    { name: "boolean true", value: true, expected: "true" },
    { name: "boolean false", value: false, expected: "false" },
    { name: "null", value: null, expected: "null" },
    { name: "undefined", value: undefined, expected: "" },
    { name: "object", value: { a: 1 }, expected: '{\n  "a": 1\n}' },
    { name: "array", value: [1, 2], expected: "[\n  1,\n  2\n]" },
  ];

  for (const { name, value, expected } of CASES) {
    it(`formats ${name}`, () => {
      expect(formatUnknownValue(value)).toBe(expected);
    });
  }

  it("falls back to String() for non-finite numbers", () => {
    expect(formatUnknownValue(NaN)).toBe("NaN");
    expect(formatUnknownValue(Infinity)).toBe("Infinity");
  });

  it("does not throw on a circular object and returns a string", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof formatUnknownValue(circular)).toBe("string");
  });
});
