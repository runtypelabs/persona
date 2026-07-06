import { describe, it, expect } from "vitest";
import {
  emptyDocument,
  documentFromTextarea,
  toPlainText,
  toDisplayText,
  toLogicalText,
  logicalLength,
  mentionBlocksInOrder,
  insertMention,
  removeMention,
  spliceDocument,
  blocksFromMessage,
  documentToMessageFields,
  MENTION_PLACEHOLDER,
  type ComposerDocument
} from "./composer-document";
import { parseMentionTrigger } from "./mention-trigger";
import type { AgentWidgetContextMentionRef } from "../types";

const appRef: AgentWidgetContextMentionRef = {
  sourceId: "files",
  itemId: "app",
  label: "App.tsx"
};
const utilRef: AgentWidgetContextMentionRef = {
  sourceId: "files",
  itemId: "util",
  label: "util.ts"
};

/** Build a document quickly and normalize via a no-op insert-free path. */
function docOf(...blocks: ComposerDocument["blocks"]): ComposerDocument {
  return { blocks };
}

describe("composer-document projections", () => {
  it("emptyDocument is a single empty text block", () => {
    expect(emptyDocument()).toEqual({ blocks: [{ kind: "text", value: "" }] });
    expect(toPlainText(emptyDocument())).toBe("");
    expect(toLogicalText(emptyDocument())).toBe("");
  });

  it("documentFromTextarea wraps the value as one text block", () => {
    expect(documentFromTextarea("hi there")).toEqual({
      blocks: [{ kind: "text", value: "hi there" }]
    });
  });

  it("projects text/display/logical distinctly around a token", () => {
    const doc = docOf(
      { kind: "text", value: "Check " },
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: " for errors" }
    );
    expect(toPlainText(doc)).toBe("Check  for errors");
    expect(toDisplayText(doc)).toBe("Check @App.tsx for errors");
    expect(toLogicalText(doc)).toBe("Check ￼ for errors");
    expect(logicalLength(doc)).toBe("Check ￼ for errors".length);
  });
});

describe("insertMention", () => {
  it("replaces the @query range with a token and returns the trailing caret", () => {
    // Start with "Check @App for errors"; caret after "@App" (index 10).
    const start = documentFromTextarea("Check @App for errors");
    const match = parseMentionTrigger(toLogicalText(start), 10);
    expect(match).toEqual({ triggerIndex: 6, query: "App" });

    const { doc, caret } = insertMention(
      start,
      { start: match!.triggerIndex, end: 10 },
      appRef,
      "m1"
    );
    expect(toDisplayText(doc)).toBe("Check @App.tsx for errors");
    // caret sits just after the inserted `￼`.
    expect(caret).toBe(7);
    expect(toLogicalText(doc)[caret - 1]).toBe("￼");
  });

  it("inserts at the very end of the document", () => {
    const start = documentFromTextarea("Look at @ap");
    const { doc } = insertMention(start, { start: 8, end: 11 }, appRef, "m1");
    expect(toDisplayText(doc)).toBe("Look at @App.tsx");
    const mentions = mentionBlocksInOrder(doc);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].ref).toEqual(appRef);
  });

  it("keeps a text slot between two adjacent inserted tokens (no adjacency)", () => {
    let doc = documentFromTextarea("@a");
    ({ doc } = insertMention(doc, { start: 0, end: 2 }, appRef, "m1"));
    // Now type another trigger right after the token and select.
    const logical = toLogicalText(doc); // "￼"
    doc = { blocks: [...doc.blocks, { kind: "text", value: "@u" }] };
    ({ doc } = insertMention(
      doc,
      { start: logical.length, end: logical.length + 2 },
      utilRef,
      "m2"
    ));
    // Two mentions, never directly adjacent (a text block separates them).
    for (let i = 0; i < doc.blocks.length - 1; i++) {
      const a = doc.blocks[i];
      const b = doc.blocks[i + 1];
      expect(a.kind === "mention" && b.kind === "mention").toBe(false);
    }
    expect(mentionBlocksInOrder(doc).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("removeMention", () => {
  it("drops a token and merges the surrounding text", () => {
    const doc = docOf(
      { kind: "text", value: "Check " },
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: " now" }
    );
    const { doc: next, caret } = removeMention(doc, "m1");
    expect(toPlainText(next)).toBe("Check  now");
    // A single merged text block remains.
    expect(next.blocks).toEqual([{ kind: "text", value: "Check  now" }]);
    // Caret lands where the token used to be.
    expect(caret).toBe("Check ".length);
  });

  it("is a no-op for an unknown id", () => {
    const doc = documentFromTextarea("nothing here");
    const { doc: next } = removeMention(doc, "missing");
    expect(next).toBe(doc);
  });
});

describe("MENTION_PLACEHOLDER", () => {
  it("is the U+FFFC object-replacement char, single-sourced from mention-trigger", () => {
    expect(MENTION_PLACEHOLDER).toBe("￼");
    expect(toLogicalText(
      docOf(
        { kind: "text", value: "a" },
        { kind: "mention", id: "m1", ref: appRef }
      )
    )).toBe(`a${MENTION_PLACEHOLDER}`);
  });
});

describe("spliceDocument", () => {
  const withToken = (): ComposerDocument =>
    docOf(
      { kind: "text", value: "a " },
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: " b" }
    );

  it("replaces a range OUTSIDE a token, preserving the token", () => {
    // logical "a ￼ b" (0='a' 1=' ' 2=￼ 3=' ' 4='b'); replace the leading "a ".
    const { doc, caret } = spliceDocument(withToken(), 0, 2, "X");
    expect(toDisplayText(doc)).toBe("X@App.tsx b");
    expect(mentionBlocksInOrder(doc)).toHaveLength(1);
    expect(caret).toBe(1);
  });

  it("drops a token when the replaced range spans it (multi-block selection)", () => {
    const { doc } = spliceDocument(withToken(), 1, 4, "");
    expect(toPlainText(doc)).toBe("ab");
    expect(mentionBlocksInOrder(doc)).toHaveLength(0);
  });

  it("orders and clamps start/end defensively", () => {
    // Reversed args → treated as [1, 4).
    const reversed = spliceDocument(withToken(), 4, 1, "-");
    expect(toPlainText(reversed.doc)).toBe("a-b");
    expect(reversed.caret).toBe(2);
    // Out-of-range args → clamped to the whole document.
    const whole = spliceDocument(withToken(), -5, 99, "Z");
    expect(toDisplayText(whole.doc)).toBe("Z");
    expect(whole.caret).toBe(1);
  });
});

describe("parseMentionTrigger over logical text", () => {
  it("does not report a query spanning an existing token", () => {
    // "@a" typed, then token, then "b": logical "@a￼b". No active trigger at end.
    const doc = docOf(
      { kind: "text", value: "@a" },
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: "b" }
    );
    const logical = toLogicalText(doc);
    expect(logical).toBe("@a￼b");
    expect(parseMentionTrigger(logical, logical.length)).toBeNull();
  });

  it("activates a fresh @ typed after a token", () => {
    const doc = docOf(
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: " @fo" }
    );
    const logical = toLogicalText(doc); // "￼ @fo"
    const match = parseMentionTrigger(logical, logical.length);
    expect(match).toEqual({ triggerIndex: 2, query: "fo" });
  });
});

describe("duplicate mentions", () => {
  it("allows the same ref twice with distinct ids", () => {
    let doc = documentFromTextarea("@a and @a");
    ({ doc } = insertMention(doc, { start: 0, end: 2 }, appRef, "m1"));
    const logical = toLogicalText(doc); // "￼ and @a"
    ({ doc } = insertMention(
      doc,
      { start: logical.indexOf("@"), end: logical.length },
      appRef,
      "m2"
    ));
    const mentions = mentionBlocksInOrder(doc);
    expect(mentions.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(mentions.every((m) => m.ref === appRef)).toBe(true);
  });
});

describe("blocksFromMessage / documentToMessageFields round-trip", () => {
  it("round-trips a message with an inline token in document order", () => {
    const doc = docOf(
      { kind: "text", value: "Check " },
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: " for errors" }
    );
    const fields = documentToMessageFields(doc);
    expect(fields.content).toBe("Check @App.tsx for errors");
    expect(fields.contextMentions).toEqual([appRef]);
    expect(fields.contentSegments).toEqual([
      { kind: "text", text: "Check " },
      {
        kind: "mention",
        sourceId: "files",
        itemId: "app",
        label: "App.tsx",
        iconName: undefined
      },
      { kind: "text", text: " for errors" }
    ]);

    // Reconstructing from the stored fields yields an equivalent document.
    const rebuilt = blocksFromMessage({
      content: fields.content,
      contentSegments: fields.contentSegments
    });
    expect(toDisplayText(rebuilt)).toBe("Check @App.tsx for errors");
    expect(mentionBlocksInOrder(rebuilt).map((m) => m.ref.itemId)).toEqual([
      "app"
    ]);
  });

  it("preserves order when the same ref appears twice (reconstruction can't infer it)", () => {
    const doc = docOf(
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: " vs " },
      { kind: "mention", id: "m2", ref: utilRef }
    );
    const fields = documentToMessageFields(doc);
    const rebuilt = blocksFromMessage({
      content: fields.content,
      contentSegments: fields.contentSegments
    });
    expect(mentionBlocksInOrder(rebuilt).map((m) => m.ref.itemId)).toEqual([
      "app",
      "util"
    ]);
    // Ids are regenerated but distinct.
    const ids = mentionBlocksInOrder(rebuilt).map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("falls back to a single text block when no segments are stored", () => {
    const doc = blocksFromMessage({ content: "just text" });
    expect(doc).toEqual({ blocks: [{ kind: "text", value: "just text" }] });
  });

  it("drops empty text runs from contentSegments", () => {
    // A leading empty text block (structural) must not leak into the transcript.
    const doc = docOf(
      { kind: "text", value: "" },
      { kind: "mention", id: "m1", ref: appRef },
      { kind: "text", value: "" }
    );
    const fields = documentToMessageFields(doc);
    expect(fields.contentSegments).toEqual([
      {
        kind: "mention",
        sourceId: "files",
        itemId: "app",
        label: "App.tsx",
        iconName: undefined
      }
    ]);
    expect(fields.content).toBe("@App.tsx");
  });
});
