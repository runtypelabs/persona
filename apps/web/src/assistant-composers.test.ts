// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import pageHtml from "../assistant-composers.html?raw";

const mocks = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("@runtypelabs/persona", () => ({ initAgentWidget: mocks.init, registerIcons: vi.fn(), renderLucideIcon: vi.fn(() => "") }));
vi.mock("./examples-nav", () => ({ renderExamplesShell: vi.fn() }));
afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it("keeps the composer and selected preset alive through repeated cached Back restores", async () => {
  vi.resetModules();
  mocks.init.mockImplementation(() => ({ destroy: vi.fn(), on: vi.fn(), update: vi.fn(),
    injectUserMessage: vi.fn(), injectAssistantMessage: vi.fn(), cancelDictation: vi.fn(),
    startVoiceRecognition: vi.fn(), startDictation: vi.fn(), getDictationState: () => ({ phase: "idle" }),
  }));
  document.body.innerHTML = pageHtml;
  await import("./assistant-composers");
  document.querySelector<HTMLButtonElement>('[data-preset="gemini"]')!.click();
  const widget = mocks.init.mock.results[1].value;
  for (let cycle = 0; cycle < 3; cycle++) {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(document.querySelector('[data-preset="gemini"]')!.getAttribute("aria-pressed")).toBe("true");
    document.getElementById("lab-voice")!.click();
    expect(widget.startVoiceRecognition).toHaveBeenCalledTimes(cycle + 1);
    expect(widget.destroy).not.toHaveBeenCalled();
    expect(mocks.init).toHaveBeenCalledTimes(2);
  }
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  expect(widget.destroy).toHaveBeenCalledOnce();
});
