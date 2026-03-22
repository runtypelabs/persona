// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { buildHeader } from "./header-builder";

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
