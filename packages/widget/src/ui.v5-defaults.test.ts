// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe.each([false, true])("core defaults lifecycle (v5=%s)", (v5Defaults) => {
  it("applies a live defaults switch to existing messages and header", () => {
    window.scrollTo = vi.fn();
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/dispatch", persistState: false,
      future: { v5Defaults }, launcher: { autoExpand: true },
    });
    controllers.push(controller);
    controller.injectUserMessage({ content: "Hello" });
    controller.injectAssistantMessage({ content: "Welcome" });
    const assertState = (v5: boolean) => {
      expect(mount.dataset.personaDefaults).toBe(v5 ? "v5" : "v4");
      const header = mount.querySelector<HTMLElement>(".persona-widget-header")!;
      expect((header.firstElementChild as HTMLElement).style.width).toBe(v5 ? "20px" : "40px");
      expect(mount.style.getPropertyValue("--persona-components-header-padding"))
        .toBe(v5 ? "8px 8px 8px 16px" : "20px 24px");
      const bubble = mount.querySelector<HTMLElement>(".persona-message-row-assistant .persona-message-bubble")!;
      expect(bubble.style.lineHeight).toBe(v5 ? "var(--persona-message-assistant-line-height, 1.75)" : "");
      const status = mount.querySelector<HTMLElement>("[data-persona-composer-status]")!;
      expect(status.style.display).toBe(v5 ? "none" : "");
    };
    assertState(v5Defaults);
    controller.update({ future: { v5Defaults: !v5Defaults } });
    assertState(!v5Defaults);
    controller.update({ future: { v5Defaults } });
    assertState(v5Defaults);
  });

  it("exposes composer chrome and honors explicit glyph overrides", () => {
    window.scrollTo = vi.fn();
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/dispatch", persistState: false, future: { v5Defaults },
      launcher: { autoExpand: true },
    });
    controllers.push(controller);
    expect(mount.style.getPropertyValue("--persona-components-composer-sendIconSize"))
      .toBe(v5Defaults ? "18px" : "");
    expect(mount.style.getPropertyValue("--persona-components-composer-sendButtonRadius"))
      .toBe(v5Defaults ? "9999px" : "");
    expect(mount.style.getPropertyValue("--persona-components-composer-footerBorder"))
      .toBe(v5Defaults ? "none" : "");
    controller.update({
      sendButton: { iconName: "send", iconSize: "15px" },
      theme: { components: { composer: {
        sendIconSize: "22px", sendButtonRadius: "8px", footerBorder: "2px solid red",
      } } },
    });
    const svg = mount.querySelector<SVGElement>("[data-persona-composer-submit] svg")!;
    expect(svg.getAttribute("width")).toBe("15");
    expect(svg.style.width).toBe("");
    expect(mount.style.getPropertyValue("--persona-components-composer-sendButtonRadius")).toBe("8px");
    expect(mount.style.getPropertyValue("--persona-components-composer-footerBorder")).toBe("2px solid red");
  });

  it("switches composer focus defaults live and retains explicit focus and resting chrome", () => {
    window.scrollTo = vi.fn();
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/dispatch", persistState: false, future: { v5Defaults },
      launcher: { autoExpand: true },
      theme: { components: { composer: { borderColor: "#123456", shadow: "0 3px 8px #123456" } } },
    });
    controllers.push(controller);
    const assertDefaults = (v5: boolean) => {
      expect(mount.style.getPropertyValue("--persona-components-composer-focusBorderColor"))
        .toBe(v5 ? "color-mix(in srgb, var(--persona-text) 28%, var(--persona-border))" : "");
      expect(mount.style.getPropertyValue("--persona-components-composer-focusRing"))
        .toBe(v5 ? "1px solid color-mix(in srgb, var(--persona-text) 12%, transparent)" : "");
      expect(mount.style.getPropertyValue("--persona-composer-border-color")).toBe("#123456");
      expect(mount.style.getPropertyValue("--persona-composer-shadow")).toBe("0 3px 8px #123456");
      // No inline outline may suppress the stylesheet's ring.
      expect(mount.querySelector<HTMLElement>("[data-persona-composer-form]")!.style.outline).toBe("");
    };
    assertDefaults(v5Defaults);
    controller.update({ future: { v5Defaults: !v5Defaults } });
    assertDefaults(!v5Defaults);
    controller.update({ theme: { components: { composer: {
      focusBorderColor: "#abcdef", focusRing: "2px solid #fedcba",
    } } } });
    for (const state of [v5Defaults, !v5Defaults]) {
      controller.update({ future: { v5Defaults: state } });
      expect(mount.style.getPropertyValue("--persona-components-composer-focusBorderColor")).toBe("#abcdef");
      expect(mount.style.getPropertyValue("--persona-components-composer-focusRing")).toBe("2px solid #fedcba");
    }
    controller.update({ theme: { components: { composer: { focusRing: "none" } } } });
    expect(mount.style.getPropertyValue("--persona-components-composer-focusRing")).toBe("none");
  });

  it("uses card geometry when expanded and honors shared or expanded theme overrides", async () => {
    window.scrollTo = vi.fn();
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/dispatch", persistState: false, future: { v5Defaults },
      launcher: { enabled: false }, composer: { layout: "single-row" },
    });
    controllers.push(controller);
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    const footer = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
    const input = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
    input.value = "First line\nSecond line";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
    expect(footer.hasAttribute("data-persona-composer-expanded")).toBe(true);
    expect(mount.style.getPropertyValue("--persona-components-composer-expandedBorderRadius"))
      .toBe(v5Defaults ? "24px" : "");
    expect(mount.style.getPropertyValue("--persona-components-composer-expandedPadding"))
      .toBe(v5Defaults ? "12px 16px" : "");
    controller.update({ theme: { components: { input: { borderRadius: "6px" }, composer: { padding: "14px" } } } });
    expect(mount.style.getPropertyValue("--persona-components-composer-expandedBorderRadius")).toBe("6px");
    expect(mount.style.getPropertyValue("--persona-components-composer-expandedPadding")).toBe("14px");
    controller.update({ theme: { components: { composer: { expandedBorderRadius: "18px", expandedPadding: "20px" } } } });
    expect(mount.style.getPropertyValue("--persona-components-composer-expandedBorderRadius")).toBe("18px");
    expect(mount.style.getPropertyValue("--persona-components-composer-expandedPadding")).toBe("20px");
  });

  it("switches default placement and fade while retaining explicit choices", () => {
    window.scrollTo = vi.fn();
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/dispatch", persistState: false, future: { v5Defaults },
      launcher: { autoExpand: true },
    });
    controllers.push(controller);
    for (const state of [v5Defaults, !v5Defaults]) {
      controller.update({ future: { v5Defaults: state } });
      expect(mount.dataset.personaComposerPlacement).toBe(state ? "overlay" : "block");
      expect(mount.style.getPropertyValue("--persona-composer-overlay-band"))
        .toBe(state ? "linear-gradient(to bottom, transparent, var(--persona-container) 24px)" : "transparent");
    }
    controller.update({ composer: { placement: "block" }, theme: { components: { composer: { overlayBand: "transparent" } } } });
    controller.update({ future: { v5Defaults: !v5Defaults } });
    expect(mount.dataset.personaComposerPlacement).toBe("block");
    expect(mount.style.getPropertyValue("--persona-composer-overlay-band")).toBe("transparent");
  });

  it("uses fullscreen turn spacing in full-height embeds and honors explicit spacing", () => {
    window.scrollTo = vi.fn();
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/dispatch", persistState: false, future: { v5Defaults },
      launcher: { enabled: false, fullHeight: true },
    });
    controllers.push(controller);
    const messages = mount.querySelector<HTMLElement>(".persona-widget-messages")!;
    expect(messages.style.gap).toContain("--persona-components-message-fullscreenGap");
    expect(mount.style.getPropertyValue("--persona-components-message-fullscreenGap"))
      .toBe(v5Defaults ? "28px" : "");
    controller.update({ theme: { components: { message: { gap: "33px" } } } });
    expect(mount.style.getPropertyValue("--persona-components-message-fullscreenGap")).toBe("33px");
    controller.update({ theme: { components: { message: { fullscreenGap: "42px" } } } });
    expect(mount.style.getPropertyValue("--persona-components-message-fullscreenGap")).toBe("42px");
  });
});
