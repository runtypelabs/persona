// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { bindComposerSurface } from "./composer-bindings";
import { buildComposer } from "./composer-builder";
import { buildPillComposer } from "./pill-composer-builder";
import type { AgentWidgetConfig } from "../types";

const fullConfig: AgentWidgetConfig = {
  apiUrl: "/api",
  attachments: { enabled: true },
  voiceRecognition: { enabled: true, provider: { type: "runtype" } },
};

/** Minimal plugin composer: required elements only, no regions. */
const bareFooter = (): HTMLElement => {
  const footer = document.createElement("div");
  const form = document.createElement("form");
  form.setAttribute("data-persona-composer-form", "");
  const input = document.createElement("textarea");
  input.setAttribute("data-persona-composer-input", "");
  form.appendChild(input);
  footer.appendChild(form);
  return footer;
};

describe("bindComposerSurface", () => {
  it("binds the full composer with every region and control", () => {
    const elements = buildComposer({ config: fullConfig });
    const bindings = bindComposerSurface(elements.footer)!;

    expect(bindings.form).toBe(elements.composerForm);
    expect(bindings.input).toBe(elements.textarea);
    expect(bindings.header).toBe(elements.header);
    expect(bindings.body).toBe(elements.textarea.parentElement);
    expect(bindings.actionsStart).toBe(elements.leftActions);
    expect(bindings.actionsEnd).toBe(elements.rightActions);
    expect(bindings.suggestions).toBe(elements.suggestions);
    expect(bindings.status).toBe(elements.statusText);
    expect(bindings.sendButton).toBe(elements.sendButton);
    expect(bindings.micButton).toBe(elements.micButton);
    expect(bindings.attachmentInput).toBe(elements.attachmentInput);
    expect(bindings.attachmentPreviews).toBe(
      elements.attachmentPreviewsContainer
    );
    expect(bindings.synthesized.size).toBe(0);
  });

  it("binds the pill composer, whose header floats above the pill", () => {
    const elements = buildPillComposer({ config: fullConfig });
    const bindings = bindComposerSurface(elements.footer)!;

    expect(bindings.form).toBe(elements.composerForm);
    expect(bindings.header).toBe(elements.header);
    expect(elements.header.contains(elements.attachmentPreviewsContainer!)).toBe(
      true
    );
    expect(bindings.actionsStart).toBe(elements.leftActions);
    expect(bindings.actionsEnd).toBe(elements.rightActions);
    expect(bindings.synthesized.size).toBe(0);
  });

  it("leaves optional controls undefined when their features are off", () => {
    const elements = buildComposer({ config: { apiUrl: "/api" } });
    const bindings = bindComposerSurface(elements.footer)!;
    expect(bindings.micButton).toBeUndefined();
    expect(bindings.attachmentInput).toBeUndefined();
    expect(bindings.attachmentPreviews).toBeUndefined();
    expect(bindings.sendButton).toBeDefined();
  });

  it("synthesizes the missing regions of a plugin footer", () => {
    const footer = bareFooter();
    const bindings = bindComposerSurface(footer)!;

    for (const region of [
      "header",
      "actionsStart",
      "actionsEnd",
      "suggestions",
      "status",
    ] as const) {
      expect(bindings[region]).toBeInstanceOf(HTMLElement);
      expect(bindings.synthesized.has(region)).toBe(true);
      // No box of its own, so a bound plugin composer's layout is untouched.
      expect(bindings[region].style.display).toBe("contents");
      expect(footer.contains(bindings[region])).toBe(true);
    }
    // `found` reports what the surface really shipped.
    expect(bindings.found.header).toBeNull();
    expect(bindings.found.actionsStart).toBeNull();
    // The body region resolves to the editor's own container, never invented.
    expect(bindings.body).toBe(bindings.form);
    expect(bindings.synthesized.has("body")).toBe(false);
  });

  it("re-binding an already synthesized footer reuses the same regions", () => {
    const footer = bareFooter();
    const first = bindComposerSurface(footer)!;
    const second = bindComposerSurface(footer)!;
    expect(second.header).toBe(first.header);
    expect(second.actionsStart).toBe(first.actionsStart);
    expect(second.synthesized.size).toBe(0);
  });

  it("still binds a legacy class-only composer", () => {
    const footer = bareFooter();
    const left = document.createElement("div");
    left.className = "persona-widget-composer__left-actions";
    const previews = document.createElement("div");
    previews.className = "persona-attachment-previews";
    const file = document.createElement("input");
    file.type = "file";
    footer.append(left, previews, file);

    const bindings = bindComposerSurface(footer)!;
    expect(bindings.actionsStart).toBe(left);
    expect(bindings.attachmentPreviews).toBe(previews);
    expect(bindings.attachmentInput).toBe(file);
  });

  it("warns and bails when a required element is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const footer = document.createElement("div");
    expect(bindComposerSurface(footer)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("form, input");
    warn.mockRestore();
  });

  it("throws in debug mode on a half-marked surface", () => {
    const footer = document.createElement("div");
    const form = document.createElement("form");
    form.setAttribute("data-persona-composer-form", "");
    footer.appendChild(form);
    expect(() => bindComposerSurface(footer, { debug: true })).toThrow(/input/);
  });

  it("warns rather than throws for a gating composer with neither marker", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A plugin footer that renders something other than an input is a
    // supported pattern, not a malformed binding.
    expect(bindComposerSurface(document.createElement("div"), { debug: true })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("destroy removes every listener registered through the bindings", () => {
    const elements = buildComposer({ config: fullConfig });
    const bindings = bindComposerSurface(elements.footer)!;
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    const onInput = vi.fn();

    bindings.addListener(bindings.form, "submit", onSubmit);
    bindings.addListener(bindings.input, "input", onInput);

    bindings.form.dispatchEvent(new Event("submit", { cancelable: true }));
    bindings.input.dispatchEvent(new Event("input"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledTimes(1);

    bindings.destroy();
    bindings.form.dispatchEvent(new Event("submit", { cancelable: true }));
    bindings.input.dispatchEvent(new Event("input"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("removeListener untracks, so destroy cannot double-remove", () => {
    const elements = buildComposer({ config: fullConfig });
    const bindings = bindComposerSurface(elements.footer)!;
    const handler = vi.fn();
    bindings.addListener(bindings.input, "keydown", handler);
    bindings.removeListener(bindings.input, "keydown", handler);
    bindings.input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(handler).not.toHaveBeenCalled();
    bindings.destroy();
    expect(handler).not.toHaveBeenCalled();
  });
});
