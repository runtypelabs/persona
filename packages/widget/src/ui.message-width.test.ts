// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAgentExperience,
  type AgentWidgetController,
} from "./ui";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
} from "./types";

// The approval UI ships in a lazy chunk; provide it eagerly so this file's
// synchronous render assertions hold. Per-file module isolation keeps the
// async transport path covered by ui.approval-chunk.test.ts.
import { provideApprovalUi } from "./approval-ui-loader";
import * as approvalUiEntry from "./approval-ui-entry";

provideApprovalUi(approvalUiEntry);


const CREATED_AT = "2026-07-24T00:00:00.000Z";

const createMount = (): HTMLElement => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const createController = (
  mount: HTMLElement,
  config: Partial<AgentWidgetConfig> = {}
): AgentWidgetController =>
  createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    ...config,
  });

const injectMessage = (
  controller: AgentWidgetController,
  message: Partial<AgentWidgetMessage> &
    Pick<AgentWidgetMessage, "id" | "role">
): void => {
  controller.injectTestMessage({
    type: "message",
    message: {
      content: "",
      createdAt: CREATED_AT,
      streaming: false,
      ...message,
    },
  });
};

const getRow = (mount: HTMLElement, id: string): HTMLElement => {
  const row = mount.querySelector<HTMLElement>(`#wrapper-${id}`);
  expect(row).not.toBeNull();
  return row!;
};

const expectRowLayout = (
  row: HTMLElement,
  expected: {
    role: "user" | "assistant" | "system";
    width: "content" | "full";
    /**
     * The inline stamp, which exists only for an explicit
     * `layout.messages.<role>.maxWidth` or `width: "full"`. `null` means the
     * stylesheet default (85%, or `components.message.<role>.maxWidth`) owns it.
     */
    maxWidth: string | null;
  }
): void => {
  expect(row.classList.contains("persona-message-row")).toBe(true);
  expect(row.classList.contains(`persona-message-row-${expected.role}`)).toBe(
    true
  );
  expect(row.classList.contains(`persona-message-width-${expected.width}`)).toBe(
    true
  );
  expect(row.getAttribute("data-message-role")).toBe(expected.role);
  expect(row.getAttribute("data-message-width")).toBe(expected.width);
  expect(
    row.style.getPropertyValue("--persona-message-row-max-width")
  ).toBe(expected.maxWidth ?? "");
};

describe("createAgentExperience: role-specific message width", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("leaves the content-row width default to the stylesheet", () => {
    const mount = createMount();
    const controller = createController(mount);

    injectMessage(controller, {
      id: "user-default",
      role: "user",
      content: "Hello",
    });
    injectMessage(controller, {
      id: "assistant-default",
      role: "assistant",
      content: "Hi there",
    });

    expectRowLayout(getRow(mount, "user-default"), {
      role: "user",
      width: "content",
      maxWidth: null,
    });
    expect(getRow(mount, "user-default").classList.contains("persona-justify-end")).toBe(
      true
    );
    expectRowLayout(getRow(mount, "assistant-default"), {
      role: "assistant",
      width: "content",
      maxWidth: null,
    });

    controller.destroy();
  });

  it("configures user and assistant geometry independently", () => {
    const mount = createMount();
    const controller = createController(mount, {
      layout: {
        messages: {
          user: { width: "content", maxWidth: "70%" },
          assistant: { width: "full" },
        },
      },
    });

    injectMessage(controller, {
      id: "user-narrow",
      role: "user",
      content: "Question",
    });
    injectMessage(controller, {
      id: "assistant-full",
      role: "assistant",
      content: "A longer response",
    });

    expectRowLayout(getRow(mount, "user-narrow"), {
      role: "user",
      width: "content",
      maxWidth: "70%",
    });
    expectRowLayout(getRow(mount, "assistant-full"), {
      role: "assistant",
      width: "full",
      maxWidth: "100%",
    });

    controller.destroy();
  });

  it("sizes the avatar and bubble together as one full-width content track", () => {
    const mount = createMount();
    const controller = createController(mount, {
      layout: {
        messages: {
          assistant: { width: "full", maxWidth: "72ch" },
          avatar: {
            show: true,
            position: "left",
            assistantAvatar: "A",
          },
        },
      },
    });

    injectMessage(controller, {
      id: "assistant-avatar",
      role: "assistant",
      content: "Avatar-backed response",
    });

    const row = getRow(mount, "assistant-avatar");
    expectRowLayout(row, {
      role: "assistant",
      width: "full",
      maxWidth: "72ch",
    });
    const track = row.querySelector<HTMLElement>(
      ":scope > .persona-message-with-avatar"
    );
    expect(track).not.toBeNull();
    expect(
      track?.querySelector(":scope > .persona-message-bubble")
    ).not.toBeNull();

    controller.destroy();
  });

  it("applies assistant geometry to tools, reasoning, approvals, and idle UI", () => {
    const mount = createMount();
    const controller = createController(mount, {
      layout: {
        messages: {
          assistant: { width: "full", maxWidth: "64rem" },
        },
      },
      loadingIndicator: {
        renderIdle: () => {
          const idle = document.createElement("span");
          idle.textContent = "Ready";
          return idle;
        },
      },
    });

    injectMessage(controller, {
      id: "tool-width",
      role: "assistant",
      variant: "tool",
      toolCall: {
        id: "tool-width",
        name: "Read file",
        status: "complete",
        chunks: ["Done"],
      },
    });
    injectMessage(controller, {
      id: "reasoning-width",
      role: "assistant",
      variant: "reasoning",
      reasoning: {
        id: "reasoning-width",
        status: "complete",
        chunks: ["Considered the options"],
      },
    });
    injectMessage(controller, {
      id: "approval-width",
      role: "assistant",
      variant: "approval",
      approval: {
        id: "approval-1",
        status: "pending",
        agentId: "agent-1",
        executionId: "execution-1",
        toolName: "Write file",
        description: "Write the generated file",
        parameters: { path: "output.md" },
      },
    });

    for (const id of ["tool-width", "reasoning-width", "approval-width"]) {
      expectRowLayout(getRow(mount, id), {
        role: "assistant",
        width: "full",
        maxWidth: "64rem",
      });
    }
    expectRowLayout(getRow(mount, "idle-indicator"), {
      role: "assistant",
      width: "full",
      maxWidth: "64rem",
    });

    controller.destroy();
  });

  it("wraps custom renderers in the resolved role row", () => {
    const mount = createMount();
    const controller = createController(mount, {
      layout: {
        messages: {
          user: { width: "full" },
          assistant: { width: "content", maxWidth: "42rem" },
          renderUserMessage: ({ message }) => {
            const element = document.createElement("article");
            element.setAttribute("data-custom-user", "");
            element.textContent = message.content;
            return element;
          },
          renderAssistantMessage: ({ message }) => {
            const element = document.createElement("article");
            element.setAttribute("data-custom-assistant", "");
            element.textContent = message.content;
            return element;
          },
        },
      },
    });

    injectMessage(controller, {
      id: "custom-user",
      role: "user",
      content: "Custom question",
    });
    injectMessage(controller, {
      id: "custom-assistant",
      role: "assistant",
      content: "Custom answer",
    });

    const userRow = getRow(mount, "custom-user");
    expectRowLayout(userRow, {
      role: "user",
      width: "full",
      maxWidth: "100%",
    });
    expect(userRow.querySelector(":scope > [data-custom-user]")).not.toBeNull();

    const assistantRow = getRow(mount, "custom-assistant");
    expectRowLayout(assistantRow, {
      role: "assistant",
      width: "content",
      maxWidth: "42rem",
    });
    expect(
      assistantRow.querySelector(":scope > [data-custom-assistant]")
    ).not.toBeNull();

    controller.destroy();
  });

  it("re-renders live rows when role width changes through update()", () => {
    const mount = createMount();
    const controller = createController(mount);

    injectMessage(controller, {
      id: "update-width",
      role: "assistant",
      content: "Update my row",
    });
    expectRowLayout(getRow(mount, "update-width"), {
      role: "assistant",
      width: "content",
      maxWidth: null,
    });

    controller.update({
      layout: {
        messages: {
          assistant: {
            width: "full",
            maxWidth: "68ch",
          },
        },
      },
    });

    expectRowLayout(getRow(mount, "update-width"), {
      role: "assistant",
      width: "full",
      maxWidth: "68ch",
    });

    controller.destroy();
  });

  it("lets a grouped tool row own the cap without applying it twice", () => {
    const mount = createMount();
    const controller = createController(mount, {
      layout: {
        messages: {
          assistant: { width: "content", maxWidth: "80%" },
        },
      },
      features: {
        toolCallDisplay: {
          grouped: true,
        },
      },
    });

    for (const id of ["group-tool-1", "group-tool-2"]) {
      injectMessage(controller, {
        id,
        role: "assistant",
        variant: "tool",
        toolCall: {
          id,
          name: "Read file",
          status: "complete",
          chunks: ["Done"],
        },
      });
    }

    const groupRow = mount.querySelector<HTMLElement>(
      "[data-persona-tool-group-row]"
    );
    expect(groupRow).not.toBeNull();
    expectRowLayout(groupRow!, {
      role: "assistant",
      width: "content",
      maxWidth: "80%",
    });
    const innerRows = groupRow!.querySelectorAll<HTMLElement>(
      ".persona-message-row"
    );
    expect(innerRows.length).toBe(2);
    innerRows.forEach((innerRow) => {
      expect(
        innerRow.style.getPropertyValue("--persona-message-row-max-width")
      ).toBe("100%");
    });

    controller.destroy();
  });
});
