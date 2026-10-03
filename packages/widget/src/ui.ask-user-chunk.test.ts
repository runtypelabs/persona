// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

// Simulate the IIFE/CDN path: the ui-extras chunk is not provided up front and
// each test controls when its load resolves.
const chunk = vi.hoisted(() => {
  const click = vi.fn();
  let release: () => void = () => {};
  let promise: Promise<unknown> = Promise.resolve();
  const reset = () => {
    click.mockClear();
    promise = new Promise((resolve) => {
      release = () =>
        resolve({
          createAskUserSheetHandlers: () => ({ click, keydown: vi.fn() }),
          createContextMentionOrchestrator: () => null,
        });
    });
  };
  return { click, reset, release: () => release(), load: () => promise };
});

vi.mock("./ui-extras-loader", () => ({
  getUiExtrasSync: () => null,
  loadUiExtras: () => chunk.load(),
  setUiExtrasLoader: () => {},
  provideUiExtras: () => {},
}));

import { createAgentExperience } from "./ui";

const mountWithSheet = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
  });
  const overlay = mount.querySelector<HTMLElement>("[data-persona-composer-overlay]")!;
  const sheet = document.createElement("div");
  sheet.setAttribute("data-persona-ask-sheet-for", "tool-1");
  const pill = document.createElement("button");
  pill.setAttribute("data-ask-user-action", "pick");
  sheet.appendChild(pill);
  overlay.appendChild(sheet);
  return { controller, sheet, pill };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ask-user sheet events waiting on the lazy chunk", () => {
  it("handles only the first of repeated early clicks", async () => {
    chunk.reset();
    const { controller, pill } = mountWithSheet();
    pill.click();
    pill.click();
    chunk.release();
    await flush();
    expect(chunk.click).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("drops a queued click whose sheet was removed before the chunk loaded", async () => {
    chunk.reset();
    const { controller, sheet, pill } = mountWithSheet();
    pill.click();
    sheet.remove();
    chunk.release();
    await flush();
    expect(chunk.click).not.toHaveBeenCalled();
    controller.destroy();
  });
});
