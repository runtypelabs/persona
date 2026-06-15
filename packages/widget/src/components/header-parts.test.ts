// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createCloseButton, createClearChatButton } from "./header-parts";
import type { AgentWidgetConfig } from "../types";

const baseConfig: AgentWidgetConfig = { apiUrl: "/api" };

describe("createCloseButton", () => {
  it("keeps the default utility classes when no style overrides are set", () => {
    const { button } = createCloseButton(baseConfig, {});
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Close chat");
    expect(button.classList.contains("persona-rounded-full")).toBe(true);
    expect(button.classList.contains("persona-border-none")).toBe(true);
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(true);
  });

  it("hides the button when showClose is false", () => {
    const { button } = createCloseButton(baseConfig, { showClose: false });
    expect(button.style.display).toBe("none");
  });

  it("drops each default class and sets the inline style for the matching override", () => {
    const { button } = createCloseButton(
      {
        ...baseConfig,
        launcher: {
          closeButtonBackgroundColor: "rgb(1, 2, 3)",
          closeButtonBorderRadius: "4px",
          closeButtonBorderWidth: "2px",
          closeButtonBorderColor: "rgb(4, 5, 6)",
        },
      },
      {}
    );
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(false);
    expect(button.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(button.classList.contains("persona-rounded-full")).toBe(false);
    expect(button.style.borderRadius).toBe("4px");
    expect(button.classList.contains("persona-border-none")).toBe(false);
    expect(button.style.borderWidth).toBe("2px");
    expect(button.style.borderStyle).toBe("solid");
  });

  it("defaults border width to 0px when only border color is provided", () => {
    const { button } = createCloseButton(
      { ...baseConfig, launcher: { closeButtonBorderColor: "rgb(7, 8, 9)" } },
      {}
    );
    expect(button.classList.contains("persona-border-none")).toBe(false);
    expect(button.style.borderWidth).toBe("0px");
    expect(button.style.borderStyle).toBe("solid");
  });
});

describe("createClearChatButton", () => {
  it("keeps the default utility classes when no style overrides are set", () => {
    const { button } = createClearChatButton(baseConfig, {});
    expect(button.type).toBe("button");
    expect(button.classList.contains("persona-rounded-full")).toBe(true);
    expect(button.classList.contains("persona-border-none")).toBe(true);
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(true);
  });

  it("drops each default class and sets the inline style for the matching override", () => {
    const { button } = createClearChatButton(
      {
        ...baseConfig,
        launcher: {
          clearChat: {
            backgroundColor: "rgb(1, 2, 3)",
            borderRadius: "4px",
            borderWidth: "2px",
            borderColor: "rgb(4, 5, 6)",
          },
        },
      },
      {}
    );
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(false);
    expect(button.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(button.classList.contains("persona-rounded-full")).toBe(false);
    expect(button.style.borderRadius).toBe("4px");
    expect(button.classList.contains("persona-border-none")).toBe(false);
    expect(button.style.borderWidth).toBe("2px");
    expect(button.style.borderStyle).toBe("solid");
  });
});
