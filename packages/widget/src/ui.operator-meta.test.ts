// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetMessage } from "./types";

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

const badges = (mount: HTMLElement, id: string) =>
  Array.from(
    row(mount, id)?.querySelectorAll<HTMLElement>(".persona-message-meta-badge") ?? []
  ).map((badge) => `${badge.textContent}:${badge.getAttribute("data-tone")}`);

describe("operator role and message meta in the transcript", () => {
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

  it("re-renders meta when the same id is injected again", async () => {
    const { mount, controller } = makeController();
    controller.injectMessage({
      id: "op1",
      role: "operator",
      content: "Your refund is on its way.",
      meta: { label: "Human", badges: [{ label: "pending", tone: "warning" }] },
    });
    await settle();
    expect(row(mount, "op1")!.querySelector(".persona-message-meta-label")?.textContent).toBe("Human");
    expect(badges(mount, "op1")).toEqual(["pending:warning"]);

    // Delivery status changes after the message is shown: same id, same text.
    controller.injectMessage({
      id: "op1",
      role: "operator",
      content: "Your refund is on its way.",
      meta: {
        label: "Human",
        badges: [{ label: "failed", tone: "danger" }],
        note: { text: "Carrier rejected the message", tone: "danger" },
      },
    });
    await settle();
    expect(badges(mount, "op1")).toEqual(["failed:danger"]);
    const note = row(mount, "op1")!.querySelector(".persona-message-meta-note");
    expect(note?.textContent).toBe("Carrier rejected the message");
    expect(note?.getAttribute("data-tone")).toBe("danger");
    expect(mount.querySelectorAll('[data-wrapper-id="op1"]')).toHaveLength(1);

    // Omitting meta keeps it; an empty meta clears it.
    controller.injectMessage({ id: "op1", role: "operator", content: "Your refund is on its way." });
    await settle();
    expect(badges(mount, "op1")).toEqual(["failed:danger"]);
    controller.injectMessage({ id: "op1", role: "operator", content: "Your refund is on its way.", meta: {} });
    await settle();
    expect(row(mount, "op1")!.querySelector(".persona-message-meta")).toBeNull();
    expect(row(mount, "op1")!.querySelector(".persona-message-meta-note")).toBeNull();
    expect(row(mount, "op1")!.querySelector(".persona-message-operator-bubble")).not.toBeNull();
  });

  it("renders operator messages and meta from initialMessages", async () => {
    const { mount } = makeController({
      initialMessages: [
        {
          id: "in1",
          role: "user",
          content: "Hi",
          createdAt: "2026-01-01T00:00:00.000Z",
          meta: { label: "User", badges: [{ label: "delivered", tone: "success" }] },
        },
        {
          id: "op1",
          role: "operator",
          content: "Hello, Sam here.",
          createdAt: "2026-01-01T00:00:01.000Z",
          meta: { label: "Human", badges: [{ label: "sent", tone: "success" }] },
        },
      ] satisfies AgentWidgetMessage[],
    });
    await settle();
    expect(row(mount, "in1")!.querySelector(".persona-message-meta-label")?.textContent).toBe("User");
    expect(badges(mount, "in1")).toEqual(["delivered:success"]);
    expect(row(mount, "op1")!.getAttribute("data-message-role")).toBe("operator");
    expect(badges(mount, "op1")).toEqual(["sent:success"]);
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

  it("never parses meta text as HTML in the live transcript", async () => {
    const { mount, controller } = makeController();
    controller.injectAssistantMessage({
      id: "a1",
      content: "Done.",
      meta: { label: "<img src=x onerror=alert(1)>", note: { text: "<script>alert(1)</script>" } },
    });
    await settle();
    const wrapper = row(mount, "a1")!;
    expect(wrapper.querySelector("img")).toBeNull();
    expect(wrapper.querySelector("script")).toBeNull();
    expect(wrapper.querySelector(".persona-message-meta-label")?.textContent).toBe(
      "<img src=x onerror=alert(1)>"
    );
  });
});

describe("message meta keeps the row geometry", () => {
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

  const bubbleFlex = (mount: HTMLElement, id: string) =>
    getComputedStyle(row(mount, id)!.querySelector<HTMLElement>(`#bubble-${id}`)!).flexGrow;

  it.each(["assistant", "user"] as const)(
    "fills a full-width %s row next to an avatar with or without meta",
    async (role) => {
      const { mount, controller } = makeController({
        layout: { messages: { [role]: { width: "full" }, avatar: { show: true } } },
      });
      const inject = role === "user"
        ? controller.injectUserMessage.bind(controller)
        : controller.injectAssistantMessage.bind(controller);
      inject({ id: "plain", content: "No meta" });
      inject({ id: "meta", content: "With meta", meta: { label: "Agent" } });
      await settle();

      expect(row(mount, "meta")!.querySelector(":scope > .persona-message-stack > .persona-message-with-avatar")).not.toBeNull();
      expect(bubbleFlex(mount, "plain")).toBe("1");
      expect(bubbleFlex(mount, "meta")).toBe("1");
    }
  );

  it("resets a stacked always-visible row action bar to the stack edges", async () => {
    const { mount, controller } = makeController({
      messageActions: { enabled: true, showCopy: true, visibility: "always", layout: "row-inside" },
    });
    controller.injectAssistantMessage({ id: "meta", content: "Refund sent.", meta: { label: "Agent" } });
    await settle();
    const bar = row(mount, "meta")!.querySelector<HTMLElement>(
      ":scope > .persona-message-stack > .persona-message-actions-row"
    )!;
    expect(bar).not.toBeNull();
    const style = getComputedStyle(bar);
    expect([style.marginLeft, style.marginRight, style.marginBottom]).toEqual(["0px", "0px", "0px"]);
    expect([style.paddingLeft, style.paddingRight, style.paddingBottom]).toEqual(["0px", "0px", "0px"]);
    expect(style.backgroundImage).not.toContain("gradient");
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
      // Width and color come from the operator tokens (V5: 1px, the neutral border).
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

  it("leaves content-width bubbles shrink-wrapped next to an avatar with meta", async () => {
    const { mount, controller } = makeController({
      layout: { messages: { avatar: { show: true } } },
    });
    controller.injectAssistantMessage({ id: "meta", content: "With meta", meta: { label: "Agent" } });
    await settle();
    expect(bubbleFlex(mount, "meta")).not.toBe("1");
  });
});
