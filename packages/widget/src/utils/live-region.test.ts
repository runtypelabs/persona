// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createLiveRegion } from "./live-region";

describe("createLiveRegion", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets politeness/atomic/role attributes for a polite region", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const region = createLiveRegion("polite", host);
    const el = host.querySelector<HTMLElement>("[data-persona-mention-live-region]")!;
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.getAttribute("aria-atomic")).toBe("true");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.classList.contains("persona-sr-only")).toBe(true);
    region.destroy();
  });

  it("uses role=alert for an assertive region", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    createLiveRegion("assertive", host);
    const el = host.querySelector<HTMLElement>("[data-persona-mention-live-region]")!;
    expect(el.getAttribute("aria-live")).toBe("assertive");
    expect(el.getAttribute("role")).toBe("alert");
  });

  it("announce clears synchronously then sets the message on the next task", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const region = createLiveRegion("polite", host);
    const el = host.querySelector<HTMLElement>("[data-persona-mention-live-region]")!;
    region.announce("2 results");
    // Cleared synchronously; the message lands only after the macrotask runs.
    expect(el.textContent).toBe("");
    vi.runAllTimers();
    expect(el.textContent).toBe("2 results");
  });

  it("identical consecutive announcements each produce a fresh write", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const region = createLiveRegion("polite", host);
    const el = host.querySelector<HTMLElement>("[data-persona-mention-live-region]")!;

    region.announce("2 results");
    vi.runAllTimers();
    expect(el.textContent).toBe("2 results");

    // A repeat must clear first so the a11y tree re-serializes the reset.
    region.announce("2 results");
    expect(el.textContent).toBe("");
    vi.runAllTimers();
    expect(el.textContent).toBe("2 results");
  });

  it("a rapid second announce supersedes the first (old message never lands)", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const region = createLiveRegion("polite", host);
    const el = host.querySelector<HTMLElement>("[data-persona-mention-live-region]")!;

    region.announce("2 results");
    region.announce("5 results");
    vi.runAllTimers();
    // Only the newest message is ever written.
    expect(el.textContent).toBe("5 results");
  });

  it("hosts in the light DOM (document.body) with inline sr-only styles when the host is shadow-rooted", () => {
    const shell = document.createElement("div");
    document.body.appendChild(shell);
    const shadow = shell.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    shadow.appendChild(inner);

    createLiveRegion("polite", inner);
    // Not inside the shadow root…
    expect(shadow.querySelector("[data-persona-mention-live-region]")).toBeNull();
    // …but on document.body, with inline visually-hidden styling.
    const el = document.body.querySelector<HTMLElement>(
      "[data-persona-mention-live-region]"
    )!;
    expect(el.parentNode).toBe(document.body);
    expect(el.style.position).toBe("absolute");
    expect(el.style.width).toBe("1px");
  });

  it("destroy removes the node", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const region = createLiveRegion("polite", host);
    expect(host.querySelector("[data-persona-mention-live-region]")).not.toBeNull();
    region.destroy();
    expect(host.querySelector("[data-persona-mention-live-region]")).toBeNull();
  });
});
