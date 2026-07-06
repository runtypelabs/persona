// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { mountInlineComposer } from "./context-mentions-inline-entry";
import type { AgentWidgetContextMentionRef } from "./types";

const renderToken = (ref: AgentWidgetContextMentionRef): HTMLElement => {
  const el = document.createElement("span");
  el.textContent = `@${ref.label}`;
  return el;
};

const makeTextarea = (): HTMLTextAreaElement => {
  const ta = document.createElement("textarea");
  document.body.appendChild(ta);
  return ta;
};

const appRef: AgentWidgetContextMentionRef = {
  sourceId: "files",
  itemId: "app",
  label: "App.tsx",
};

describe("mountInlineComposer", () => {
  it("mirrors the textarea's inline styles onto the contenteditable (no visual pop)", () => {
    const ta = makeTextarea();
    ta.className = "persona-composer-textarea";
    ta.style.maxHeight = "60px";
    ta.style.overflowY = "auto";
    ta.style.fontWeight = "500";
    ta.setAttribute("placeholder", "Ask about a file…");

    const handle = mountInlineComposer({ textarea: ta, renderToken });
    const el = handle.element;

    expect(el.style.maxHeight).toBe("60px");
    expect(el.style.overflowY).toBe("auto");
    expect(el.style.fontWeight).toBe("500");
    expect(el.className).toContain("persona-composer-textarea");
    // Placeholder + accessible name mirror across.
    expect(el.getAttribute("data-placeholder")).toBe("Ask about a file…");
    expect(el.getAttribute("aria-label")).toBe("Ask about a file…");
    handle.destroy();
  });

  it("maps the shimmed `placeholder` property onto data-placeholder", () => {
    const ta = makeTextarea();
    const handle = mountInlineComposer({ textarea: ta, renderToken });
    const el = handle.element as unknown as HTMLTextAreaElement;

    el.placeholder = "Type here";
    expect(handle.element.getAttribute("data-placeholder")).toBe("Type here");
    expect(handle.element.getAttribute("aria-label")).toBe("Type here");
    expect(el.placeholder).toBe("Type here");
    handle.destroy();
  });

  it("exposes ordered contentSegments via getInlineMessageFields", () => {
    const ta = makeTextarea();
    const handle = mountInlineComposer({ textarea: ta, renderToken });
    handle.input.setValueWithCaret("Check ", 6);
    handle.input.insertMentionAtSelection!(appRef);

    const fields = (
      handle.element as unknown as {
        getInlineMessageFields: () => {
          contentSegments: Array<{ kind: string; label?: string; text?: string }>;
        };
      }
    ).getInlineMessageFields();

    const kinds = fields.contentSegments.map((s) => s.kind);
    expect(kinds).toContain("mention");
    const mention = fields.contentSegments.find((s) => s.kind === "mention");
    expect(mention?.label).toBe("App.tsx");
    handle.destroy();
  });

  it("untracks tokens when the shim value setter clears the composer", () => {
    const ta = makeTextarea();
    const onMentionRemoved = vi.fn();
    const handle = mountInlineComposer({
      textarea: ta,
      renderToken,
      onMentionRemoved,
    });
    const el = handle.element as unknown as HTMLTextAreaElement;
    const id = handle.input.insertMentionAtSelection!(appRef);

    // Programmatic `value =` (voice/clear path) drops the token DOM; the shim must
    // fire the adapter's reconcile so the manager aborts that mention's resolve.
    el.value = "";
    expect(onMentionRemoved).toHaveBeenCalledWith(id);
    handle.destroy();
  });
});
