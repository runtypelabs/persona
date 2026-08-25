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

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const actionButton = (mount: HTMLElement, messageId: string, action: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-actions-for="${messageId}"] [data-action="${action}"]`
  );

const actionOrder = (mount: HTMLElement, messageId: string) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>(
      `[data-actions-for="${messageId}"] [data-action]`
    )
  ).map((button) => button.getAttribute("data-action"));

const turn = (): AgentWidgetMessage[] => [
  {
    id: "u1",
    role: "user",
    content: "a question",
    createdAt: "2026-01-01T00:00:00.000Z",
    sequence: 1,
  },
  {
    id: "a1",
    role: "assistant",
    content: "an answer",
    createdAt: "2026-01-01T00:00:01.000Z",
    sequence: 2,
  },
];

describe("messageActions.custom", () => {
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

  it("appends a namespaced button after the built-ins", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: true,
        custom: [{ id: "share", label: "Share", iconName: "share", onSelect: () => {} }],
      },
    });
    await flush();
    expect(actionOrder(mount, "a1")).toEqual(["copy", "custom:share"]);
    expect(actionButton(mount, "a1", "custom:share")!.getAttribute("aria-label")).toBe(
      "Share"
    );
  });

  it("dispatches onSelect with the message", async () => {
    const onSelect = vi.fn();
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: { custom: [{ id: "share", label: "Share", onSelect }] },
    });
    await flush();
    actionButton(mount, "a1", "custom:share")!.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ id: "a1", content: "an answer" });
  });

  it("is assistant-only by default", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: false,
        custom: [{ id: "share", label: "Share", onSelect: () => {} }],
      },
    });
    await flush();
    expect(actionButton(mount, "a1", "custom:share")).not.toBeNull();
    expect(actionButton(mount, "u1", "custom:share")).toBeNull();
  });

  it("brings up the user row on its own when roles include user", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: false,
        showEdit: false,
        showQuote: false,
        custom: [
          { id: "flag", label: "Flag", roles: ["user"], onSelect: () => {} },
        ],
      },
    });
    await flush();
    expect(actionOrder(mount, "u1")).toEqual(["custom:flag"]);
    expect(actionButton(mount, "a1", "custom:flag")).toBeNull();
  });

  it("renders on both roles when both are listed", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: false,
        custom: [
          {
            id: "pin",
            label: "Pin",
            roles: ["user", "assistant"],
            onSelect: () => {},
          },
        ],
      },
    });
    await flush();
    expect(actionButton(mount, "u1", "custom:pin")).not.toBeNull();
    expect(actionButton(mount, "a1", "custom:pin")).not.toBeNull();
  });

  it("honors visibility, align and layout like the built-ins", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: false,
        visibility: "always",
        align: "left",
        layout: "row-inside",
        custom: [{ id: "share", label: "Share", onSelect: () => {} }],
      },
    });
    await flush();
    const row = mount.querySelector<HTMLElement>('[data-actions-for="a1"]')!;
    expect(row.classList.contains("persona-message-actions-left")).toBe(true);
    expect(row.classList.contains("persona-message-actions-row")).toBe(true);
    expect(row.classList.contains("persona-message-actions-hover")).toBe(false);
  });

  it("renders nothing when messageActions is disabled", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        enabled: false,
        custom: [{ id: "share", label: "Share", onSelect: () => {} }],
      },
    });
    await flush();
    expect(actionButton(mount, "a1", "custom:share")).toBeNull();
  });

  it("resolves the callback off live config, not the element", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { mount, controller } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: false,
        custom: [{ id: "share", label: "Share", onSelect: first }],
      },
    });
    await flush();
    controller.update({
      messageActions: {
        showCopy: false,
        custom: [{ id: "share", label: "Share", onSelect: second }],
      },
    } as never);
    await flush();
    actionButton(mount, "a1", "custom:share")!.click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("survives a throwing onSelect", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: {
        showCopy: false,
        custom: [
          {
            id: "boom",
            label: "Boom",
            onSelect: () => {
              throw new Error("nope");
            },
          },
        ],
      },
    });
    await flush();
    expect(() => actionButton(mount, "a1", "custom:boom")!.click()).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});
