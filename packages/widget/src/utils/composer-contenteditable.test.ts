// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createContentEditableComposerInput,
  domPositionToLogical,
  logicalToDomPosition,
  MENTION_TOKEN_CLASS
} from "./composer-contenteditable";
import type { AgentWidgetContextMentionRef } from "../types";

const appRef: AgentWidgetContextMentionRef = {
  sourceId: "files",
  itemId: "app",
  label: "App.tsx"
};

let idSeq = 0;
const generateId = () => `mid-${++idSeq}`;

/** Stand-in for the core orchestrator's pill factory (now a required option).
 *  Mirrors createMentionTokenElement's accessible attributes so the
 *  setMentionStatus stash/restore behaves as it does on real default tokens. */
function defaultRenderToken(ref: AgentWidgetContextMentionRef): HTMLElement {
  const el = document.createElement("span");
  el.className = MENTION_TOKEN_CLASS;
  el.setAttribute("title", ref.label);
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${ref.label} mention`);
  const label = document.createElement("span");
  label.className = "persona-mention-token-label";
  label.textContent = `@${ref.label}`;
  el.appendChild(label);
  return el;
}

function make(overrides = {}) {
  const onMentionInserted = vi.fn();
  const onMentionRemoved = vi.fn();
  const input = createContentEditableComposerInput({
    generateId,
    renderToken: defaultRenderToken,
    onMentionInserted,
    onMentionRemoved,
    ...overrides
  });
  document.body.appendChild(input.element);
  return { input, onMentionInserted, onMentionRemoved };
}

function tokenSpans(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(`.${MENTION_TOKEN_CLASS}`)
  );
}

/** Seed one mention token via the product insertion path: `before` text, the
 *  token, then `after` text. Places a real DOM caret first (jsdom won't focus a
 *  contenteditable) so the token splices at that offset. Returns the mention id. */
function seedToken(
  input: ReturnType<typeof make>["input"],
  before: string,
  after: string,
  ref: AgentWidgetContextMentionRef = appRef
): string {
  input.setValueWithCaret(before + after, before.length);
  const sel = window.getSelection()!;
  const pos = logicalToDomPosition(input.element, before.length);
  const range = document.createRange();
  range.setStart(pos.node, pos.offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return input.insertMentionAtSelection!(ref);
}

describe("composer-contenteditable caret mapping", () => {
  it("maps between DOM position and logical offset around a token", () => {
    // "Check " + [token] + " end"  → logical "Check ￼ end"
    const root = document.createElement("div");
    const t1 = document.createTextNode("Check ");
    const span = document.createElement("span");
    span.setAttribute("data-mention-id", "m1");
    span.setAttribute("contenteditable", "false");
    span.textContent = "@App.tsx";
    const t2 = document.createTextNode(" end");
    root.append(t1, span, t2);

    // caret in the leading text at offset 3 → logical 3
    expect(domPositionToLogical(root, t1, 3)).toBe(3);
    // caret right after the token (root offset 2) → logical 7 (6 + ￼)
    expect(domPositionToLogical(root, root, 2)).toBe(7);
    // caret in the trailing text at offset 2 → logical 9 (6 + 1 + 2)
    expect(domPositionToLogical(root, t2, 2)).toBe(9);

    // reverse: logical 3 → inside the first text node
    expect(logicalToDomPosition(root, 3)).toEqual({ node: t1, offset: 3 });
    // logical 6 (token boundary) resolves to end of the text node — the caret
    // spot equivalent to "just before the token".
    expect(logicalToDomPosition(root, 6)).toEqual({ node: t1, offset: 6 });
    // logical 7 (just after the token) → root child slot 2
    expect(logicalToDomPosition(root, 7)).toEqual({ node: root, offset: 2 });
  });

  it("treats a <br> as one newline in caret math (both directions)", () => {
    // "a" + <br> + "b" → logical "a\nb": a=0, \n=1 (the <br>), b=2.
    const root = document.createElement("div");
    const t1 = document.createTextNode("a");
    const br = document.createElement("br");
    const t2 = document.createTextNode("b");
    root.append(t1, br, t2);

    // caret after "a"
    expect(domPositionToLogical(root, t1, 1)).toBe(1);
    // caret after the <br> (root child slot 2) → logical 2
    expect(domPositionToLogical(root, root, 2)).toBe(2);
    // caret after "b"
    expect(domPositionToLogical(root, t2, 1)).toBe(3);

    // reverse: logical 3 lands inside the trailing text node
    expect(logicalToDomPosition(root, 3)).toEqual({ node: t2, offset: 1 });
    // logical 2 (just after the break) → root child slot 2
    expect(logicalToDomPosition(root, 2)).toEqual({ node: root, offset: 2 });
  });
});

describe("createContentEditableComposerInput", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    idSeq = 0;
  });

  it("starts empty and contenteditable", () => {
    const { input } = make();
    expect(input.element.getAttribute("contenteditable")).toBe("true");
    expect(input.element.getAttribute("data-persona-composer-input")).toBe("");
    expect(input.element.childNodes).toHaveLength(0); // :empty for placeholder
    expect(input.getValue()).toBe("");
    expect(input.getLogicalText()).toBe("");
  });

  it("renders a document with an atomic token and projects text", () => {
    const { input } = make();
    const id = seedToken(input, "Check ", " now");
    const spans = tokenSpans(input.element);
    expect(spans).toHaveLength(1);
    expect(spans[0].getAttribute("contenteditable")).toBe("false");
    expect(spans[0].getAttribute("data-mention-id")).toBe(id);
    expect(input.getValue()).toBe("Check @App.tsx now");
    expect(input.getLogicalText()).toBe("Check ￼ now");
  });

  it("re-parses the DOM live after a native text edit", () => {
    const { input } = make();
    input.setValueWithCaret("hello", 5);
    // Simulate the browser mutating the text node (native typing).
    (input.element.firstChild as Text).data = "hello world";
    expect(input.getValue()).toBe("hello world");
    expect(input.getDocument!().blocks).toEqual([
      { kind: "text", value: "hello world" }
    ]);
  });

  it("insertMentionAtTrigger replaces the @query with a token and tracks it", () => {
    const { input, onMentionInserted } = make();
    input.setValueWithCaret("Check @App", 10);
    const id = input.insertMentionAtTrigger!(appRef, {
      triggerIndex: 6,
      query: "App"
    });
    expect(id).toBe("mid-1");
    // Completion appends the separating space (Slack-style).
    expect(input.getValue()).toBe("Check @App.tsx ");
    expect(input.getLogicalText()).toBe("Check ￼ ");
    expect(tokenSpans(input.element)).toHaveLength(1);
    expect(onMentionInserted).toHaveBeenCalledWith("mid-1", appRef);
  });

  it("insertMentionAtTrigger returns null on a stale trigger range", () => {
    const { input, onMentionInserted } = make();
    input.setValueWithCaret("Check @App", 10);
    // Query no longer matches what's in the document.
    const id = input.insertMentionAtTrigger!(appRef, {
      triggerIndex: 6,
      query: "Xyz"
    });
    expect(id).toBeNull();
    expect(tokenSpans(input.element)).toHaveLength(0);
    expect(onMentionInserted).not.toHaveBeenCalled();
  });

  it("allows duplicate refs as distinct tokens with distinct ids", () => {
    const { input } = make();
    input.setValueWithCaret("@App", 4);
    const id1 = input.insertMentionAtTrigger!(appRef, {
      triggerIndex: 0,
      query: "App"
    });
    // Type another trigger after the token and insert again.
    const logical = input.getLogicalText(); // "￼"
    input.setValueWithCaret(logical + " @App", logical.length + 5);
    // Re-inserting requires the token to be present; simplest: assert two ids
    // differ when inserted on fresh text.
    input.setValueWithCaret("@App", 4);
    const id2 = input.insertMentionAtTrigger!(appRef, {
      triggerIndex: 0,
      query: "App"
    });
    expect(id1).not.toBe(id2);
  });

  it("fires onMentionRemoved when a token disappears from the DOM (input)", () => {
    const { input, onMentionRemoved } = make();
    const id = seedToken(input, "a ", " b");
    // Simulate the user deleting the token node, then the browser firing input.
    tokenSpans(input.element)[0].remove();
    input.element.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onMentionRemoved).toHaveBeenCalledWith(id);
  });

  it("does not reconcile removals mid-IME-composition", () => {
    const { input, onMentionRemoved } = make();
    const id = seedToken(input, "", "");
    input.element.dispatchEvent(new Event("compositionstart"));
    tokenSpans(input.element)[0].remove();
    input.element.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onMentionRemoved).not.toHaveBeenCalled();
    // On composition end the reconcile runs.
    input.element.dispatchEvent(new Event("compositionend"));
    expect(onMentionRemoved).toHaveBeenCalledWith(id);
  });

  it("coerces paste to plain text (splice fallback)", () => {
    const { input } = make();
    input.setValueWithCaret("ab", 2);
    // Force the fallback path (jsdom has no working execCommand insert).
    const original = document.execCommand;
    // @ts-expect-error override for the test
    document.execCommand = undefined;
    try {
      // jsdom lacks DataTransfer/ClipboardEvent.clipboardData — fake it.
      const evt = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(evt, "clipboardData", {
        value: { getData: (type: string) => (type === "text/plain" ? "XY" : "") }
      });
      // Caret at end (offset 2) via a real range.
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.setStart(input.element.firstChild!, 2);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      input.element.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(input.getValue()).toBe("abXY");
    } finally {
      document.execCommand = original;
    }
  });

  it("reads a native <br> back as a newline (getValue / getLogicalText)", () => {
    const { input } = make();
    input.setValueWithCaret("a", 1);
    // Simulate Shift+Enter: the browser inserts a <br> then a text node.
    input.element.append(
      document.createElement("br"),
      document.createTextNode("b")
    );
    expect(input.getValue()).toBe("a\nb");
    expect(input.getLogicalText()).toBe("a\nb");
    expect(input.getDocument!().blocks).toEqual([
      { kind: "text", value: "a" },
      { kind: "text", value: "\n" },
      { kind: "text", value: "b" }
    ]);
  });

  it("round-trips a newline through the document model (getValue keeps \\n)", () => {
    const { input } = make();
    input.setValueWithCaret("a\nb", 3);
    expect(input.getValue()).toBe("a\nb");
    expect(input.getLogicalText()).toBe("a\nb");
  });

  it("inserts a mention after a line break", () => {
    const { input } = make();
    input.setValueWithCaret("a", 1);
    input.element.append(
      document.createElement("br"),
      document.createTextNode("@App")
    );
    // logical is now "a\n@App"; caret after "@App" (offset 6), trigger at index 2.
    const id = input.insertMentionAtTrigger!(appRef, {
      triggerIndex: 2,
      query: "App"
    });
    expect(id).not.toBeNull();
    expect(input.getValue()).toBe("a\n@App.tsx ");
    expect(input.getLogicalText()).toBe("a\n￼ ");
    expect(tokenSpans(input.element)).toHaveLength(1);
  });

  it("normalizes insertParagraph to a newline (no <div>/<p> wrapping)", () => {
    const { input } = make();
    input.setValueWithCaret("ab", 2);
    // Caret between "a" and "b".
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(input.element.firstChild!, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    const evt = new InputEvent("beforeinput", {
      inputType: "insertParagraph",
      bubbles: true,
      cancelable: true
    });
    input.element.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(input.getValue()).toBe("a\nb");
  });

  it("setValueWithCaret does not clobber a selection outside the composer (unfocused)", () => {
    const { input } = make();
    const outside = document.createElement("div");
    outside.setAttribute("contenteditable", "true");
    outside.textContent = "hello world";
    document.body.appendChild(outside);
    // Select "llo" in the outside element; focus is NOT in the composer.
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(outside.firstChild!, 2);
    range.setEnd(outside.firstChild!, 5);
    sel.removeAllRanges();
    sel.addRange(range);

    input.setValueWithCaret("new text", 3);

    const after = window.getSelection()!.getRangeAt(0);
    expect(after.startContainer).toBe(outside.firstChild);
    expect(after.startOffset).toBe(2);
    expect(after.endOffset).toBe(5);
  });

  it("setValue (intentional) focuses and places the caret at the end", () => {
    const { input } = make();
    input.setValue("hello");
    expect(input.getValue()).toBe("hello");
    expect(input.getSelection()).toEqual({ start: 5, end: 5 });
  });

  it("paste fallback preserves an existing token (splices at the document level)", () => {
    const { input, onMentionRemoved } = make();
    seedToken(input, "a ", "");
    const original = document.execCommand;
    // @ts-expect-error force the fallback path
    document.execCommand = undefined;
    try {
      // Caret at the end of the document (after the token).
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(input.element);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      const evt = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(evt, "clipboardData", {
        value: { getData: (t: string) => (t === "text/plain" ? "x" : "") }
      });
      input.element.dispatchEvent(evt);
      // Seed's auto-space already separates; the paste lands after it.
      expect(input.getValue()).toBe("a @App.tsx x");
      expect(tokenSpans(input.element)).toHaveLength(1);
      expect(onMentionRemoved).not.toHaveBeenCalled();
    } finally {
      document.execCommand = original;
    }
  });

  it("replaceLogicalRange rewrites a span while preserving tokens outside it", () => {
    const { input } = make();
    seedToken(input, "hi ", " /look");
    // logical "hi ￼ /look": token at 3, "/look" spans [5, 10).
    input.replaceLogicalRange!(5, 10, "/lookup ");
    expect(tokenSpans(input.element)).toHaveLength(1); // token survived
    expect(input.getValue()).toBe("hi @App.tsx /lookup ");
    expect(input.getLogicalText()).toBe("hi ￼ /lookup ");
    // Caret lands just after the inserted text (logical 5 + "/lookup ".length).
    expect(input.getSelection()).toEqual({ start: 13, end: 13 });
  });

  it("setMentionStatus surfaces an accessible title + aria-label on error and restores them", () => {
    const { input } = make();
    const id = seedToken(input, "", "");
    const span = tokenSpans(input.element)[0];
    input.setMentionStatus!(id, "error");
    expect(span.getAttribute("title")).toBe("App.tsx: failed to attach context");
    // The red styling is visual-only; the failure must reach AT via aria-label.
    expect(span.getAttribute("aria-label")).toContain("failed to attach");
    input.setMentionStatus!(id, "resolved");
    expect(span.getAttribute("title")).toBe("App.tsx");
    // Non-error restores the normal "{label} mention" name.
    expect(span.getAttribute("aria-label")).toBe("App.tsx mention");
  });

  it("setMentionStatus never rewrites attributes on host-rendered custom tokens outside an error", () => {
    const { input } = make({
      renderToken: (ref: AgentWidgetContextMentionRef) => {
        const el = document.createElement("span");
        el.className = MENTION_TOKEN_CLASS;
        el.setAttribute("aria-label", `custom ${ref.label}`);
        // Deliberately no title and no .persona-mention-token-label child.
        return el;
      }
    });
    const id = seedToken(input, "", "");
    const span = tokenSpans(input.element)[0];
    // resolveOn:"select" success path fires "resolved" without a prior error:
    // the host's accessible name must be left untouched.
    input.setMentionStatus!(id, "resolved");
    expect(span.getAttribute("aria-label")).toBe("custom App.tsx");
    expect(span.hasAttribute("title")).toBe(false);
    // Error overrides with the ref label (not scraped builder markup)...
    input.setMentionStatus!(id, "error");
    expect(span.getAttribute("aria-label")).toBe(
      "App.tsx, failed to attach context"
    );
    expect(span.getAttribute("title")).toBe("App.tsx: failed to attach context");
    // ...and recovery restores exactly the pre-error state, absent title included.
    input.setMentionStatus!(id, "resolved");
    expect(span.getAttribute("aria-label")).toBe("custom App.tsx");
    expect(span.hasAttribute("title")).toBe(false);
  });

  it("setMentionStatus toggles the error class and is a no-op for unknown ids", () => {
    const { input } = make();
    const id = seedToken(input, "", "");
    const span = tokenSpans(input.element)[0];
    input.setMentionStatus!(id, "error");
    expect(span.classList.contains("persona-mention-token-error")).toBe(true);
    input.setMentionStatus!(id, "resolved");
    expect(span.classList.contains("persona-mention-token-error")).toBe(false);
    input.setMentionStatus!(id, "pending");
    expect(span.classList.contains("persona-mention-token-error")).toBe(false);
    // Unknown id: silent no-op.
    expect(() => input.setMentionStatus!("nope", "error")).not.toThrow();
  });

  it("destroy() detaches listeners", () => {
    const { input, onMentionRemoved } = make();
    seedToken(input, "", "");
    input.destroy();
    tokenSpans(input.element)[0].remove();
    input.element.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onMentionRemoved).not.toHaveBeenCalled();
  });

  describe("getLogicalRangeRect", () => {
    it("builds a non-collapsed range around the glyph and returns its rect", () => {
      const { input } = make();
      input.setValueWithCaret("hi @a", 5); // single text node "hi @a"
      const textNode = input.element.firstChild!;
      const setStart = vi.fn();
      const setEnd = vi.fn();
      const fakeRect = {
        left: 40,
        right: 48,
        top: 10,
        bottom: 24,
        width: 8,
        height: 14
      } as DOMRect;
      const createRange = vi
        .spyOn(document, "createRange")
        .mockReturnValue({
          setStart,
          setEnd,
          getBoundingClientRect: () => fakeRect
        } as unknown as Range);

      // The "@" sits at logical index 3; measure the single glyph [3, 4).
      const rect = input.getLogicalRangeRect!(3, 4);

      expect(rect).toBe(fakeRect);
      // Endpoints are the logical→DOM mapping of both ends (non-collapsed), which
      // for a single text node is (textNode, 3) and (textNode, 4).
      expect(setStart).toHaveBeenCalledWith(textNode, 3);
      expect(setEnd).toHaveBeenCalledWith(textNode, 4);
      createRange.mockRestore();
    });

    it("returns null for invalid ranges", () => {
      const { input } = make();
      input.setValueWithCaret("hi @a", 5);
      expect(input.getLogicalRangeRect!(3, 3)).toBeNull(); // empty
      expect(input.getLogicalRangeRect!(4, 2)).toBeNull(); // reversed
      expect(input.getLogicalRangeRect!(Number.NaN, 4)).toBeNull();
    });

    it("returns null for a degenerate (zero-size) rect", () => {
      const { input } = make();
      input.setValueWithCaret("hi @a", 5);
      // jsdom's Range.getBoundingClientRect is all-zeros → treated as unmeasurable.
      expect(input.getLogicalRangeRect!(3, 4)).toBeNull();
    });
  });
});
