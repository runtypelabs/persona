// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createWidgetView, resolveLauncher } from "./widget-view";
import type { HeaderElements } from "./header-builder";
import type { AgentWidgetConfig } from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";

describe("createWidgetView: default assembly", () => {
  const config: AgentWidgetConfig = {
    apiUrl: "/api",
    voiceRecognition: { enabled: true, provider: { type: "runtype" } },
    attachments: { enabled: true },
  };

  it("groups shell, transcript, header, and composer refs over the real nodes", () => {
    const view = createWidgetView({ config, showClose: true });

    // Shell. The empty `panel` is wired to the `container` later by ui.ts
    // (panel.appendChild(container)); createWidgetView preserves that split.
    expect(view.shell.wrapper.contains(view.shell.panel)).toBe(true);
    expect(view.shell.pillRoot).toBeUndefined();

    // Transcript subtree is wired by buildPanel
    expect(view.transcript.container.contains(view.transcript.body)).toBe(true);
    expect(view.transcript.body.contains(view.transcript.messagesWrapper)).toBe(true);

    // Header + composer are mounted in the container
    expect(view.transcript.container.contains(view.header.element)).toBe(true);
    expect(view.transcript.container.contains(view.composer.footer)).toBe(true);

    // Grouped refs are the same nodes as the raw flat panelElements
    expect(view.composer.textarea).toBe(view.panelElements.textarea);
    expect(view.composer.footer).toBe(view.panelElements.footer);
    expect(view.header.element).toBe(view.panelElements.header);
  });

  it("exposes the stable composer ref attributes", () => {
    const view = createWidgetView({ config, showClose: true });

    expect(view.composer.textarea.getAttribute("data-persona-composer-input")).toBe("");
    expect(view.composer.sendButton.getAttribute("data-persona-composer-submit")).toBe("");
    expect(view.composer.statusText.getAttribute("data-persona-composer-status")).toBe("");
    expect(view.composer.suggestions.getAttribute("data-persona-composer-suggestions")).toBe("");
    expect(view.composer.actionsRow.getAttribute("data-persona-composer-actions")).toBe("");
    expect(view.composer.micButton).not.toBeNull();
    expect(
      view.composer.attachmentButton?.getAttribute("data-persona-composer-attachment-button")
    ).toBe("");
    expect(
      view.composer.attachmentInput?.getAttribute("data-persona-composer-attachment-input")
    ).toBe("");
    expect(
      view.composer.attachmentPreviewsContainer?.getAttribute(
        "data-persona-composer-attachment-previews"
      )
    ).toBe("");
  });

  it("hides header and footer when layout disables them", () => {
    const view = createWidgetView({
      config: { apiUrl: "/api", layout: { showHeader: false, showFooter: false } },
      showClose: true,
    });

    expect(view.header.element.style.display).toBe("none");
    expect(view.composer.footer.style.display).toBe("none");
  });
});

describe("createWidgetView: composer-bar assembly", () => {
  const config: AgentWidgetConfig = {
    apiUrl: "/api",
    launcher: { mountMode: "composer-bar" },
  };

  it("exposes the pill root and peek banner", () => {
    const view = createWidgetView({ config, showClose: true });

    expect(view.shell.pillRoot).toBeInstanceOf(HTMLElement);
    expect(view.composer.peekBanner).toBeInstanceOf(HTMLElement);
    expect(view.composer.peekTextNode).toBeInstanceOf(HTMLElement);
    // Composer-bar uses a hidden placeholder header (close button is the chrome).
    expect(view.header.element.style.display).toBe("none");
  });
});

describe("createWidgetView: replacement helpers", () => {
  it("replaceHeader swaps the mounted element and mirrors sub-refs", () => {
    const view = createWidgetView({ config: { apiUrl: "/api" }, showClose: true });
    const original = view.header.element;
    const parent = original.parentElement;

    const next: HeaderElements = {
      header: document.createElement("header"),
      iconHolder: document.createElement("span"),
      headerTitle: document.createElement("span"),
      headerSubtitle: document.createElement("span"),
      closeButton: document.createElement("button"),
      closeButtonWrapper: document.createElement("div"),
      clearChatButton: null,
      clearChatButtonWrapper: null,
    };

    const returned = view.replaceHeader(next);

    expect(returned).toBe(next);
    expect(view.header.element).toBe(next.header);
    expect(view.header.iconHolder).toBe(next.iconHolder);
    expect(view.header.closeButton).toBe(next.closeButton);
    expect(parent?.contains(next.header)).toBe(true);
    expect(parent?.contains(original)).toBe(false);
  });

  it("replaceComposer swaps the mounted footer and updates the ref", () => {
    const view = createWidgetView({ config: { apiUrl: "/api" }, showClose: true });
    const original = view.composer.footer;
    const parent = original.parentElement;
    const nextFooter = document.createElement("div");

    view.replaceComposer(nextFooter);

    expect(view.composer.footer).toBe(nextFooter);
    expect(parent?.contains(nextFooter)).toBe(true);
    expect(parent?.contains(original)).toBe(false);
  });
});

describe("resolveLauncher", () => {
  const config: AgentWidgetConfig = { apiUrl: "/api" };

  it("builds the default launcher controller and wires onToggle", () => {
    const onToggle = vi.fn();
    const { instance, element } = resolveLauncher({ config, plugins: [], onToggle });

    expect(instance).not.toBeNull();
    expect(element).toBe(instance?.element);
    expect(element.tagName).toBe("BUTTON");

    element.dispatchEvent(new Event("click"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("uses a plugin-provided launcher element and returns no controller", () => {
    const custom = document.createElement("div");
    custom.id = "custom-launcher";
    const plugin: AgentWidgetPlugin = {
      id: "custom",
      renderLauncher: ({ defaultRenderer }) => {
        // The default renderer is still callable; the plugin opts to ignore it.
        expect(defaultRenderer().tagName).toBe("BUTTON");
        return custom;
      },
    };

    const { instance, element } = resolveLauncher({
      config,
      plugins: [plugin],
      onToggle: () => {},
    });

    expect(instance).toBeNull();
    expect(element).toBe(custom);
  });

  it("falls back to the default launcher when the plugin returns null", () => {
    const plugin: AgentWidgetPlugin = {
      id: "passthrough",
      renderLauncher: () => null,
    };

    const { instance, element } = resolveLauncher({
      config,
      plugins: [plugin],
      onToggle: () => {},
    });

    expect(instance).not.toBeNull();
    expect(element).toBe(instance?.element);
  });
});
