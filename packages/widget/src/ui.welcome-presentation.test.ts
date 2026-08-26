// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config?: Record<string, unknown>) => {
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

const welcomeHost = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-welcome]")!;

const kicker = (mount: HTMLElement) =>
  welcomeHost(mount).querySelector<HTMLElement>(".persona-welcome-kicker")!;

const titleRow = (mount: HTMLElement) =>
  welcomeHost(mount).querySelector<HTMLElement>(".persona-welcome-title-row")!;

describe("welcome presentation", () => {
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

  describe("defaults", () => {
    it("stamps neither align nor icon placement", () => {
      const { mount } = makeController();
      const host = welcomeHost(mount);
      expect(host.hasAttribute("data-persona-welcome-align")).toBe(false);
      expect(host.hasAttribute("data-persona-welcome-icon-placement")).toBe(false);
    });

    it("hides the kicker and keeps the icon, title, subtitle order", () => {
      const { mount } = makeController({
        welcome: { icon: { type: "text", text: "*" } },
      });
      expect(kicker(mount).hidden).toBe(true);
      expect(kicker(mount).textContent).toBe("");
      // The wrappers are `display: contents`, so the visual order is unchanged.
      const order = Array.from(
        welcomeHost(mount).querySelectorAll<HTMLElement>(
          ".persona-welcome-icon, .persona-welcome-kicker, .persona-welcome-title, .persona-welcome-subtitle"
        )
      ).map((el) => el.className);
      expect(order).toEqual([
        "persona-welcome-icon",
        "persona-welcome-kicker",
        "persona-welcome-title",
        "persona-welcome-subtitle",
      ]);
    });
  });

  describe("welcome.kicker", () => {
    it("renders the line above the title when set", () => {
      const { mount } = makeController({ welcome: { kicker: "Search" } });
      expect(kicker(mount).hidden).toBe(false);
      expect(kicker(mount).textContent).toBe("Search");
      expect(
        kicker(mount).compareDocumentPosition(
          welcomeHost(mount).querySelector(".persona-welcome-title")!
        ) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("reverts to hidden when dropped from config", () => {
      const { mount, controller } = makeController({ welcome: { kicker: "Search" } });
      expect(kicker(mount).hidden).toBe(false);
      controller.update({ welcome: { kicker: undefined } } as never);
      expect(kicker(mount).hidden).toBe(true);
      expect(kicker(mount).textContent).toBe("");
    });
  });

  describe("welcome.icon.placement", () => {
    it("stamps inline and keeps the icon inside the title row", () => {
      const { mount } = makeController({
        welcome: { icon: { type: "lucide", name: "sparkles", placement: "inline" } },
      });
      expect(
        welcomeHost(mount).getAttribute("data-persona-welcome-icon-placement")
      ).toBe("inline");
      const row = titleRow(mount);
      expect(row.querySelector(".persona-welcome-icon")).not.toBeNull();
      expect(row.querySelector(".persona-welcome-title")).not.toBeNull();
    });

    it("stamps nothing for the above placement or the function form", () => {
      const { mount } = makeController({
        welcome: { icon: { type: "text", text: "*", placement: "above" } },
      });
      expect(
        welcomeHost(mount).hasAttribute("data-persona-welcome-icon-placement")
      ).toBe(false);

      const second = makeController({
        welcome: { icon: () => document.createElement("span") },
      });
      expect(
        welcomeHost(second.mount).hasAttribute("data-persona-welcome-icon-placement")
      ).toBe(false);
    });

    it("unstamps when the icon is dropped", () => {
      const { mount, controller } = makeController({
        welcome: { icon: { type: "text", text: "*", placement: "inline" } },
      });
      expect(
        welcomeHost(mount).getAttribute("data-persona-welcome-icon-placement")
      ).toBe("inline");
      controller.update({ welcome: { icon: undefined } } as never);
      expect(
        welcomeHost(mount).hasAttribute("data-persona-welcome-icon-placement")
      ).toBe(false);
    });
  });

  describe("welcome.align", () => {
    it("stamps start and center when configured", () => {
      const { mount } = makeController({ welcome: { align: "start" } });
      expect(welcomeHost(mount).getAttribute("data-persona-welcome-align")).toBe(
        "start"
      );

      const second = makeController({
        welcome: { variant: "hero", align: "start" },
      });
      expect(
        welcomeHost(second.mount).getAttribute("data-persona-welcome-align")
      ).toBe("start");
    });

    it("ignores an unknown value", () => {
      const { mount } = makeController({ welcome: { align: "middle" } });
      expect(welcomeHost(mount).hasAttribute("data-persona-welcome-align")).toBe(
        false
      );
    });

    it("unstamps when dropped from config", () => {
      const { mount, controller } = makeController({ welcome: { align: "center" } });
      expect(welcomeHost(mount).getAttribute("data-persona-welcome-align")).toBe(
        "center"
      );
      controller.update({ welcome: { align: undefined } } as never);
      expect(welcomeHost(mount).hasAttribute("data-persona-welcome-align")).toBe(
        false
      );
    });
  });
});
