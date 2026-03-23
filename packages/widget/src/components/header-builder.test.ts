// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mergeWithDefaults } from "../defaults";
import { buildHeader } from "./header-builder";

describe("buildHeader button styling", () => {
  it("preserves default hover classes when using merged default config", () => {
    const { closeButton, clearChatButton } = buildHeader({
      config: mergeWithDefaults() as any
    });

    expect(closeButton.classList.contains("persona-text-persona-muted")).toBe(true);
    expect(closeButton.classList.contains("hover:persona-text-persona-primary")).toBe(true);
    expect(closeButton.classList.contains("hover:persona-bg-gray-100")).toBe(true);
    expect(closeButton.style.color).toBe("");
    expect(closeButton.style.backgroundColor).toBe("");
    expect(closeButton.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");

    expect(clearChatButton).not.toBeNull();
    expect(clearChatButton?.classList.contains("persona-text-persona-muted")).toBe(true);
    expect(clearChatButton?.classList.contains("hover:persona-text-persona-primary")).toBe(true);
    expect(clearChatButton?.classList.contains("hover:persona-bg-gray-100")).toBe(true);
    expect(clearChatButton?.style.color).toBe("");
    expect(clearChatButton?.style.backgroundColor).toBe("");
    expect(clearChatButton?.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
  });

  it("treats explicit header action colors as static overrides", () => {
    const { closeButton, clearChatButton } = buildHeader({
      config: mergeWithDefaults({
        launcher: {
          closeButtonColor: "#123456",
          closeButtonBackgroundColor: "transparent",
          clearChat: {
            enabled: true,
            iconColor: "#654321",
            backgroundColor: "transparent"
          }
        }
      }) as any
    });

    expect(closeButton.classList.contains("persona-text-persona-muted")).toBe(false);
    expect(closeButton.classList.contains("hover:persona-text-persona-primary")).toBe(false);
    expect(closeButton.classList.contains("hover:persona-bg-gray-100")).toBe(false);
    expect(closeButton.style.color).not.toBe("");
    expect(closeButton.style.backgroundColor).not.toBe("");
    expect(closeButton.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");

    expect(clearChatButton).not.toBeNull();
    expect(clearChatButton?.classList.contains("persona-text-persona-muted")).toBe(false);
    expect(clearChatButton?.classList.contains("hover:persona-text-persona-primary")).toBe(false);
    expect(clearChatButton?.classList.contains("hover:persona-bg-gray-100")).toBe(false);
    expect(clearChatButton?.style.color).not.toBe("");
    expect(clearChatButton?.style.backgroundColor).not.toBe("");
    expect(clearChatButton?.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
  });
});

describe("buildHeader tooltips", () => {
  it("portals the close-button tooltip into the mounted document", () => {
    const iframeDocument = document.implementation.createHTMLDocument("preview");
    const { header, closeButton, closeButtonWrapper } = buildHeader({
      config: {
        launcher: {
          clearChat: { enabled: false },
          closeButtonShowTooltip: true,
          closeButtonTooltipText: "Close chat"
        }
      } as any
    });

    iframeDocument.body.appendChild(header);

    expect(closeButton.ownerDocument).toBe(iframeDocument);

    closeButtonWrapper.dispatchEvent(new Event("mouseenter"));

    expect(iframeDocument.body.querySelector(".persona-clear-chat-tooltip")).not.toBeNull();
    expect(document.body.querySelector(".persona-clear-chat-tooltip")).toBeNull();

    closeButtonWrapper.dispatchEvent(new Event("mouseleave"));

    expect(iframeDocument.body.querySelector(".persona-clear-chat-tooltip")).toBeNull();
  });
});
