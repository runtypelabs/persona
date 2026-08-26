// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

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

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const footerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-footer")!;

const layoutOf = (mount: HTMLElement) =>
  footerOf(mount).getAttribute("data-persona-composer-layout");

describe("composer.layout", () => {
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

  it("leaves the footer untouched when unset", async () => {
    const { mount } = makeController();
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it("leaves the footer untouched for the stacked default", async () => {
    const { mount } = makeController({ composer: { layout: "stacked" } });
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it("stamps single-row when configured", async () => {
    const { mount } = makeController({ composer: { layout: "single-row" } });
    await flush();
    expect(layoutOf(mount)).toBe("single-row");
  });

  it("keeps the compact attribute as the idle gate", async () => {
    const { mount } = makeController({ composer: { layout: "single-row" } });
    await flush();
    const footer = footerOf(mount);
    expect(footer.hasAttribute("data-persona-composer-compact")).toBe(true);

    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;
    textarea.value = "one\ntwo";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();

    // The layout stays declared; only the compact gate drops, so the CSS falls
    // back to the stacked card.
    expect(layoutOf(mount)).toBe("single-row");
    expect(footer.hasAttribute("data-persona-composer-compact")).toBe(false);
  });

  it("is ignored in composer-bar mount mode", async () => {
    const { mount } = makeController({
      launcher: { enabled: false, mountMode: "composer-bar" },
      composer: { layout: "single-row" },
    });
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });

  it("follows a live update() in both directions", async () => {
    const { mount, controller } = makeController();
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);

    controller.update({ composer: { layout: "single-row" } } as never);
    await flush();
    expect(layoutOf(mount)).toBe("single-row");

    controller.update({ composer: { layout: "stacked" } } as never);
    await flush();
    expect(footerOf(mount).hasAttribute("data-persona-composer-layout")).toBe(false);
  });
});
