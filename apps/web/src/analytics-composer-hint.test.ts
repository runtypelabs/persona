// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installComposerAttentionHint } from "./analytics-composer-hint";

describe("analytics composer attention hint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <main id="mount"><div class="persona-pill-composer"><textarea></textarea></div></main>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("plays once after an idle period and removes itself", () => {
    const composer = document.querySelector<HTMLElement>(".persona-pill-composer")!;
    const hint = installComposerAttentionHint({
      root: document.getElementById("mount")!,
      isOpen: () => false,
      idleMs: 1_000,
      durationMs: 500,
    });

    vi.advanceTimersByTime(999);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(true);
    vi.advanceTimersByTime(500);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(false);

    hint.destroy();
  });

  it("restarts the idle clock after unrelated page activity", () => {
    const composer = document.querySelector<HTMLElement>(".persona-pill-composer")!;
    const hint = installComposerAttentionHint({
      root: document.getElementById("mount")!,
      isOpen: () => false,
      idleMs: 1_000,
    });

    vi.advanceTimersByTime(700);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.advanceTimersByTime(999);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(true);

    hint.destroy();
  });

  it("cancels permanently once the composer is engaged", () => {
    const composer = document.querySelector<HTMLElement>(".persona-pill-composer")!;
    const hint = installComposerAttentionHint({
      root: document.getElementById("mount")!,
      isOpen: () => false,
      idleMs: 1_000,
    });

    composer.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.advanceTimersByTime(5_000);
    expect(composer.classList.contains("northstar-composer-hint")).toBe(false);

    hint.destroy();
  });
});
