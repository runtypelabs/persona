// @vitest-environment jsdom

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
