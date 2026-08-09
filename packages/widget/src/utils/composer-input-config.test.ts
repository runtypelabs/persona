// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  applyComposerEnterKeyHint,
  applyComposerInputAttributes,
  applyComposerMaxLines,
  deriveEnterKeyHint,
  isCoarsePointer,
  isSubmitKeydown,
  resolveComposerLock,
  resolveMaxLines,
} from "./composer-input-config";
import type { ComposerSubmitKey } from "../types";

type KeyInput = Parameters<typeof isSubmitKeydown>[0];

const key = (overrides: Partial<KeyInput> = {}): KeyInput => ({
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
  ...overrides,
});

describe("isSubmitKeydown", () => {
  const modes: ComposerSubmitKey[] = ["enter", "mod-enter", "none"];

  it("submits on a bare Enter only under submitKey enter", () => {
    const results = modes.map((submitKey) =>
      isSubmitKeydown(key(), { submitKey })
    );
    expect(results).toEqual([true, false, false]);
  });

  it("submits on Command+Enter and Ctrl+Enter under enter and mod-enter", () => {
    for (const modifier of ["metaKey", "ctrlKey"] as const) {
      const results = modes.map((submitKey) =>
        isSubmitKeydown(key({ [modifier]: true }), { submitKey })
      );
      // "enter" has always accepted a held modifier; only "none" refuses.
      expect(results).toEqual([true, true, false]);
    }
  });

  it("defaults to enter when submitKey is unset", () => {
    expect(isSubmitKeydown(key(), {})).toBe(true);
  });

  it("never submits on Shift+Enter, another key, or during IME composition", () => {
    for (const submitKey of modes) {
      expect(isSubmitKeydown(key({ shiftKey: true }), { submitKey })).toBe(false);
      expect(isSubmitKeydown(key({ key: "a" }), { submitKey })).toBe(false);
      expect(isSubmitKeydown(key({ isComposing: true }), { submitKey })).toBe(
        false
      );
      expect(
        isSubmitKeydown(key({ metaKey: true, isComposing: true }), { submitKey })
      ).toBe(false);
    }
  });

  it("inserts a newline on a coarse pointer when insertNewlineOnTouchEnter is set", () => {
    const options = { submitKey: "enter" as const, insertNewlineOnTouchEnter: true };
    expect(isSubmitKeydown(key(), { ...options, coarsePointer: true })).toBe(
      false
    );
    expect(isSubmitKeydown(key(), { ...options, coarsePointer: false })).toBe(
      true
    );
    // The override reassigns a bare Enter only: a held modifier still submits.
    expect(
      isSubmitKeydown(key({ metaKey: true }), { ...options, coarsePointer: true })
    ).toBe(true);
    expect(
      isSubmitKeydown(key({ metaKey: true }), {
        submitKey: "mod-enter",
        insertNewlineOnTouchEnter: true,
        coarsePointer: true,
      })
    ).toBe(true);
  });
});

describe("deriveEnterKeyHint", () => {
  it("is send only while a bare Enter submits", () => {
    expect(deriveEnterKeyHint({})).toBe("send");
    expect(deriveEnterKeyHint({ submitKey: "enter" })).toBe("send");
    expect(deriveEnterKeyHint({ submitKey: "mod-enter" })).toBe("enter");
    expect(deriveEnterKeyHint({ submitKey: "none" })).toBe("enter");
    expect(
      deriveEnterKeyHint({
        submitKey: "enter",
        insertNewlineOnTouchEnter: true,
        coarsePointer: true,
      })
    ).toBe("enter");
  });

  it("writes the derived hint onto the element", () => {
    const el = document.createElement("textarea");
    applyComposerEnterKeyHint(el, { submitKey: "mod-enter" });
    expect(el.getAttribute("enterkeyhint")).toBe("enter");
    applyComposerEnterKeyHint(el, { submitKey: "enter" });
    expect(el.getAttribute("enterkeyhint")).toBe("send");
  });
});

describe("isCoarsePointer", () => {
  it("reads the pointer media query and survives its absence", () => {
    const original = window.matchMedia;
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
    expect(isCoarsePointer()).toBe(false);

    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    expect(isCoarsePointer()).toBe(true);

    window.matchMedia = original;
  });
});

describe("maxLines", () => {
  it("falls back for missing and non-positive values", () => {
    expect(resolveMaxLines(undefined, 3)).toBe(3);
    expect(resolveMaxLines(0, 3)).toBe(3);
    expect(resolveMaxLines(-4, 3)).toBe(3);
    expect(resolveMaxLines(Number.NaN, 3)).toBe(3);
    expect(resolveMaxLines(7, 3)).toBe(7);
  });

  it("caps the element height at the requested line count", () => {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    el.style.lineHeight = "24px";
    applyComposerMaxLines(el, 4);
    expect(el.style.maxHeight).toBe("96px");
    expect(el.style.overflowY).toBe("auto");
    el.remove();
  });

  it("uses the 20px fallback when the line height is unmeasurable", () => {
    const el = document.createElement("div");
    applyComposerMaxLines(el, 3);
    expect(el.style.maxHeight).toBe("60px");
  });
});

describe("applyComposerInputAttributes", () => {
  it("applies exactly the five allowlisted attributes", () => {
    const el = document.createElement("textarea");
    applyComposerInputAttributes(el, {
      autocomplete: "on",
      autocapitalize: "sentences",
      spellcheck: false,
      inputmode: "text",
      ariaLabel: "Ask a question",
    });
    expect(el.getAttribute("autocomplete")).toBe("on");
    expect(el.getAttribute("autocapitalize")).toBe("sentences");
    expect(el.getAttribute("spellcheck")).toBe("false");
    expect(el.getAttribute("inputmode")).toBe("text");
    expect(el.getAttribute("aria-label")).toBe("Ask a question");
  });

  it("defaults autocomplete to off and omits the rest", () => {
    const el = document.createElement("textarea");
    applyComposerInputAttributes(el, undefined);
    expect(el.getAttribute("autocomplete")).toBe("off");
    expect(el.hasAttribute("autocapitalize")).toBe(false);
    expect(el.hasAttribute("spellcheck")).toBe(false);
    expect(el.hasAttribute("inputmode")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  it("cannot override persona data attributes, disabled, class, style, or value", () => {
    const el = document.createElement("textarea");
    el.setAttribute("data-persona-composer-input", "");
    el.className = "persona-composer-textarea";
    el.style.color = "red";
    el.value = "draft";
    el.disabled = true;

    applyComposerInputAttributes(el, {
      // Extra keys are structurally rejected: the type IS the allowlist.
      "data-persona-composer-input": "hijacked",
      disabled: false,
      class: "evil",
      style: "display:none",
      value: "",
      name: "x",
      onclick: "alert(1)",
    } as never);

    expect(el.getAttribute("data-persona-composer-input")).toBe("");
    expect(el.className).toBe("persona-composer-textarea");
    expect(el.style.color).toBe("red");
    expect(el.value).toBe("draft");
    expect(el.disabled).toBe(true);
    expect(el.hasAttribute("name")).toBe(false);
    expect(el.hasAttribute("onclick")).toBe(false);
  });

  it("restores defaults when a key is dropped on a later update", () => {
    const el = document.createElement("textarea");
    applyComposerInputAttributes(el, {
      autocomplete: "on",
      spellcheck: true,
      ariaLabel: "First",
    });
    applyComposerInputAttributes(el, {});
    expect(el.getAttribute("autocomplete")).toBe("off");
    expect(el.hasAttribute("spellcheck")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  it("ignores values of the wrong type", () => {
    const el = document.createElement("textarea");
    applyComposerInputAttributes(el, {
      spellcheck: "yes",
      inputmode: "",
      ariaLabel: 12,
    } as never);
    expect(el.hasAttribute("spellcheck")).toBe(false);
    expect(el.hasAttribute("inputmode")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });
});

describe("resolveComposerLock", () => {
  it("normalizes the boolean and object forms", () => {
    expect(resolveComposerLock(undefined)).toEqual({ disabled: false });
    expect(resolveComposerLock(false)).toEqual({ disabled: false });
    expect(resolveComposerLock(true)).toEqual({ disabled: true });
    expect(resolveComposerLock({})).toEqual({
      disabled: true,
      reason: undefined,
    });
    expect(resolveComposerLock({ reason: "Read only" })).toEqual({
      disabled: true,
      reason: "Read only",
    });
  });
});
