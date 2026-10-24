// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetMessage } from "./types";
import type { AgentWidgetPlugin } from "./plugins/types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

/** Let microtasks and the coalesced render frame run. */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 32));
};

const row = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLElement>(`[data-wrapper-id="${id}"]`);

describe("operator role in the transcript", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders an operator row on the assistant side with its own bubble", async () => {
    const { mount, controller } = makeController();
    controller.injectUserMessage({ id: "u1", content: "Where is my order?" });
    controller.injectAssistantMessage({ id: "a1", content: "Let me check." });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here, I refunded it." });
    await settle();

    const operatorRow = row(mount, "op1")!;
    expect(operatorRow.getAttribute("data-message-role")).toBe("operator");
    expect(operatorRow.classList.contains("persona-message-row-operator")).toBe(true);
    expect(operatorRow.classList.contains("persona-justify-end")).toBe(false);
    expect(operatorRow.querySelector(".persona-message-operator-bubble")).not.toBeNull();
    expect(operatorRow.querySelector(".persona-message-assistant-bubble")).toBeNull();

    // Existing roles are untouched.
    expect(row(mount, "u1")!.classList.contains("persona-justify-end")).toBe(true);
    expect(row(mount, "a1")!.querySelector(".persona-message-assistant-bubble")).not.toBeNull();
  });

  it("does not report operator messages as assistant messages", async () => {
    const { controller } = makeController();
    const assistantMessages: AgentWidgetMessage[] = [];
    controller.on("assistant:message", (message) => assistantMessages.push(message));
    controller.injectMessage({ id: "op1", role: "operator", content: "Hello from support" });
    controller.injectAssistantMessage({ id: "a1", content: "Agent reply" });
    await settle();
    expect(assistantMessages.map((message) => message.id)).toEqual(["a1"]);
  });

  it("renders operator messages from initialMessages", async () => {
    const { mount } = makeController({
      initialMessages: [
        { id: "in1", role: "user", content: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "op1", role: "operator", content: "Hello, Sam here.", createdAt: "2026-01-01T00:00:01.000Z" },
      ] satisfies AgentWidgetMessage[],
    });
    await settle();
    expect(row(mount, "in1")!.getAttribute("data-message-role")).toBe("user");
    expect(row(mount, "op1")!.getAttribute("data-message-role")).toBe("operator");
    expect(row(mount, "op1")!.querySelector(".persona-message-operator-bubble")).not.toBeNull();
  });

  it("shrink-wraps operator rows even when the assistant is full width", async () => {
    const { mount, controller } = makeController({
      layout: { messages: { assistant: { width: "full" } } },
    });
    controller.injectAssistantMessage({ id: "a1", content: "Let me check." });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
    await settle();
    expect(row(mount, "a1")!.getAttribute("data-message-width")).toBe("full");
    const operatorRow = row(mount, "op1")!;
    expect(operatorRow.getAttribute("data-message-width")).toBe("content");
    // It keeps the assistant's full-width cap, so a long message can still fill the column.
    expect(operatorRow.style.getPropertyValue("--persona-message-row-max-width")).toBe(
      "var(--persona-message-operator-max-width, var(--persona-message-assistant-max-width, 100%))"
    );
  });
});

describe("operator bubble styles", () => {
  let stylesheet: HTMLStyleElement;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync("src/styles/widget.css", "utf8");
    document.head.append(stylesheet);
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    stylesheet.remove();
    document.body.innerHTML = "";
  });

  it.each(["bubble", "flat", "minimal"] as const)(
    "outlines the V5 operator bubble in the %s layout",
    async (layout) => {
      const { mount, controller } = makeController({
        future: { v5Defaults: true },
        layout: { messages: { layout } },
      });
      controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
      await settle();
      const bubble = row(mount, "op1")!.querySelector<HTMLElement>("#bubble-op1")!;
      const style = getComputedStyle(bubble);
      expect(style.borderTopStyle).toBe("solid");
      // Width and fill come from the V5 operator tokens on the themed ancestor.
      const token = (name: string) => {
        for (let node: HTMLElement | null = bubble; node; node = node.parentElement) {
          const value = node.style.getPropertyValue(name).trim();
          if (value) return value;
        }
        return "";
      };
      expect(token("--persona-components-message-operator-borderWidth")).toBe("1px");
      expect(token("--persona-components-message-operator-background")).toBe("transparent");
    }
  );

  it.each(["flat", "minimal"] as const)("keeps the V4 %s operator borderless", async (layout) => {
    const { mount, controller } = makeController({ layout: { messages: { layout } } });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
    await settle();
    const bubble = row(mount, "op1")!.querySelector<HTMLElement>("#bubble-op1")!;
    expect(getComputedStyle(bubble).borderTopStyle).not.toBe("solid");
  });
});

/**
 * Hosts draw per-message badges (delivery status, author label, errors) with a
 * `renderMessage` plugin: it wraps the default bubble, appends a
 * `data-preserve-runtime` slot, and the host fills that slot itself. These
 * tests pin the route for operator rows.
 */
describe("operator messages through a renderMessage plugin slot", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const slotPlugin = (seen: AgentWidgetMessage["role"][]): AgentWidgetPlugin => ({
    id: "delivery-status",
    renderMessage: ({ message, defaultRenderer }) => {
      seen.push(message.role);
      if (message.role !== "operator" && message.role !== "assistant") return null;
      const element = defaultRenderer();
      const slot = document.createElement("div");
      slot.setAttribute("data-preserve-runtime", "true");
      slot.setAttribute("data-status-slot", message.id);
      element.insertBefore(slot, element.querySelector(":scope > .persona-message-actions"));
      return element;
    },
  });

  const slot = (mount: HTMLElement, id: string) =>
    row(mount, id)?.querySelector<HTMLElement>(`[data-status-slot="${id}"]`) ?? null;

  /** What a host does once the row is on screen: fill the slot with its own UI. */
  const fillSlot = (target: HTMLElement, text: string) => {
    const badge = document.createElement("span");
    badge.className = "host-status";
    badge.textContent = text;
    target.replaceChildren(badge);
  };

  it("runs the hook for operator rows and uses the element it returns", async () => {
    const seen: AgentWidgetMessage["role"][] = [];
    const { mount, controller } = makeController({ plugins: [slotPlugin(seen)] });
    controller.injectUserMessage({ id: "u1", content: "Where is my order?" });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here, I refunded it." });
    await settle();

    expect(seen).toContain("operator");
    expect(seen).toContain("user");
    const operatorRow = row(mount, "op1")!;
    expect(operatorRow.getAttribute("data-message-role")).toBe("operator");
    expect(slot(mount, "op1")).not.toBeNull();
    // The plugin returned null for the user row, so it keeps the default bubble.
    expect(row(mount, "u1")!.querySelector("[data-status-slot]")).toBeNull();
    expect(row(mount, "u1")!.querySelector(".persona-message-user-bubble")).not.toBeNull();
  });

  it("keeps the operator bubble class when a plugin wraps the default renderer", async () => {
    const { mount, controller } = makeController({ plugins: [slotPlugin([])] });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
    await settle();

    const bubble = row(mount, "op1")!.querySelector<HTMLElement>("#bubble-op1")!;
    expect(bubble.classList.contains("persona-message-operator-bubble")).toBe(true);
    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(false);
    expect(bubble.getAttribute("data-persona-theme-zone")).toBe("operator-message");
    expect(bubble.contains(slot(mount, "op1"))).toBe(true);
  });

  it("keeps the host-filled slot node across controller.update()", async () => {
    const seen: AgentWidgetMessage["role"][] = [];
    const { mount, controller } = makeController({ plugins: [slotPlugin(seen)] });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
    await settle();
    const first = slot(mount, "op1")!;
    fillSlot(first, "Delivered");
    const rendersBefore = seen.length;

    controller.update({ copy: { welcomeTitle: "Support" } });
    await settle();
    controller.update({ theme: { components: { message: { operator: { borderRadius: "4px" } } } } });
    await settle();

    // The plugin rendered the row again, and the morph kept the live slot.
    expect(seen.length).toBeGreaterThan(rendersBefore);
    expect(slot(mount, "op1")).toBe(first);
    expect(first.isConnected).toBe(true);
    expect(first.querySelector(".host-status")?.textContent).toBe("Delivered");
    expect(row(mount, "op1")!.querySelector(".persona-message-operator-bubble")).not.toBeNull();
  });

  it("keeps the host-filled slot node when injectMessage upserts the same id", async () => {
    const seen: AgentWidgetMessage["role"][] = [];
    const { mount, controller } = makeController({ plugins: [slotPlugin(seen)] });
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
    await settle();
    const first = slot(mount, "op1")!;
    fillSlot(first, "Sending");

    // Same id, same text: a status-only change on the host side.
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here." });
    await settle();
    expect(slot(mount, "op1")).toBe(first);

    // Same id, new text: the plugin renders the row again and the slot survives.
    const rendersBefore = seen.length;
    controller.injectMessage({ id: "op1", role: "operator", content: "Sam here, refund sent." });
    await settle();
    expect(seen.length).toBeGreaterThan(rendersBefore);

    expect(mount.querySelectorAll('[data-wrapper-id="op1"]')).toHaveLength(1);
    expect(slot(mount, "op1")).toBe(first);
    // The host's content is still there; the host then updates it in place.
    expect(first.querySelector(".host-status")?.textContent).toBe("Sending");
    fillSlot(first, "Delivered");
    expect(slot(mount, "op1")?.querySelector(".host-status")?.textContent).toBe("Delivered");
    expect(row(mount, "op1")!.querySelector("#bubble-op1")?.textContent).toContain("refund sent");
    expect(row(mount, "op1")!.querySelector(".persona-message-operator-bubble")).not.toBeNull();
  });
});
