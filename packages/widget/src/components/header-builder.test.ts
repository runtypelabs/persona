// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEADER_ICON_SIZE,
  DEFAULT_LAUNCHER_CONFIG,
} from "../defaults";
import { buildHeader } from "./header-builder";

describe("buildHeader tooltips", () => {
  it("adds padding outside the custom image box without shrinking its content", () => {
    const { iconHolder } = buildHeader({ config: {
      apiUrl: "/dispatch", launcher: { headerIconSize: "20px", headerIconName: "", iconUrl: "/logo.svg" },
    } });
    expect(iconHolder.style.boxSizing).toBe("content-box");
    expect(iconHolder.style.padding).toBe("var(--persona-components-header-iconPadding, 0px)");
    expect(iconHolder.style.flexShrink).toBe("0");
    expect(iconHolder.style.width).toBe("20px");
    expect(iconHolder.querySelector("img")?.style.width).toBe("20px");
    expect(iconHolder.querySelector("svg")).toBeNull();
  });
  it.each([{ v5Defaults: false }, { v5Defaults: true }])(
    "uses the standard padding token under v5Defaults=%s",
    (future) => {
      const { header } = buildHeader({ config: { future } as any });
      expect(header.style.padding).toBe(
        "var(--persona-components-header-padding, 20px 24px)"
      );
    }
  );
  it.each([false, true])("preserves legacy numeric glyph sizing for non-pixel icon boxes (v5=%s)", (v5Defaults) => {
    const { iconHolder } = buildHeader({ config: {
      apiUrl: "/dispatch", future: { v5Defaults },
      launcher: { headerIconSize: "2rem", headerIconName: "bot" },
    } });
    const glyph = iconHolder.querySelector("svg")!;
    expect(iconHolder.style.width).toBe("2rem");
    expect(glyph.getAttribute("width")).toBe("1.2");
    expect(glyph.style.width).toBe("calc(2px * var(--persona-components-header-iconScale, 0.6))");
  });

  it("uses the shared launcher icon default", () => {
    const { iconHolder } = buildHeader({});

    expect(DEFAULT_LAUNCHER_CONFIG.headerIconSize).toBe(DEFAULT_HEADER_ICON_SIZE);
    expect(iconHolder.style.height).toBe(DEFAULT_HEADER_ICON_SIZE);
    expect(iconHolder.style.width).toBe(DEFAULT_HEADER_ICON_SIZE);
  });

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

    expect(iframeDocument.body.querySelector(".persona-control-tooltip")).not.toBeNull();
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();

    closeButtonWrapper.dispatchEvent(new Event("mouseleave"));

    expect(iframeDocument.body.querySelector(".persona-control-tooltip")).toBeNull();
  });
});
