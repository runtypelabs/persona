// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

/**
 * Mount a widget with a never-resolving fetch, send a message, and return the
 * standalone typing indicator bubble rendered during the silent gap.
 */
const renderTypingBubble = async (
  config: Record<string, unknown>
): Promise<{ bubble: HTMLElement; destroy: () => void }> => {
  global.fetch = vi.fn().mockImplementation(
    () => new Promise(() => {})
  ) as unknown as typeof fetch;

  const mount = createMount();
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);

  controller.submitMessage("hello");
  await Promise.resolve();
  await Promise.resolve();

  const bubble = mount.querySelector<HTMLElement>('[data-typing-indicator="true"]')!;
  return { bubble, destroy: () => controller.destroy() };
};

describe("standalone typing indicator bubble", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the assistant bubble classes under the default bubble layout", async () => {
    const { bubble, destroy } = await renderTypingBubble({});

    expect(bubble).not.toBeNull();
    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(true);
    expect(bubble.classList.contains("persona-shadow-sm")).toBe(true);
    expect(bubble.classList.contains("persona-border")).toBe(true);
    expect(bubble.classList.contains("persona-px-5")).toBe(true);

    destroy();
  });

  it("drops the shadow and border under the minimal layout", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      layout: { messages: { layout: "minimal" } },
    });

    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(true);
    expect(bubble.classList.contains("persona-shadow-sm")).toBe(false);
    expect(bubble.classList.contains("persona-border")).toBe(false);
    expect(bubble.classList.contains("persona-px-3")).toBe(true);
    // Minimal keeps the surface background, matching its message bubbles.
    expect(bubble.style.backgroundColor).toContain("--persona-message-assistant-bg");

    destroy();
  });

  it("drops the background entirely under the flat layout", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      layout: { messages: { layout: "flat" } },
    });

    expect(bubble.classList.contains("persona-shadow-sm")).toBe(false);
    expect(bubble.classList.contains("persona-border")).toBe(false);
    expect(bubble.style.backgroundColor).toBe("");

    destroy();
  });

  it("renders bare text classes when loadingIndicator.showBubble is false", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      loadingIndicator: { showBubble: false },
    });

    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(false);
    expect(bubble.classList.contains("persona-shadow-sm")).toBe(false);
    expect(bubble.classList.contains("persona-border")).toBe(false);
    expect(bubble.style.backgroundColor).toBe("");

    destroy();
  });

  it("honors the assistant bubble theme background token", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      layout: { messages: { layout: "minimal" } },
    });

    // The bubble reads the same variable the assistant message bubbles read,
    // so `theme.components.message.assistant.background` covers both.
    expect(bubble.style.backgroundColor).toBe(
      "var(--persona-message-assistant-bg, var(--persona-surface))"
    );

    destroy();
  });
});
