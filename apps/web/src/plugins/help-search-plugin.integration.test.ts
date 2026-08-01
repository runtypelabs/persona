// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createAgentExperience } from "@runtypelabs/persona";

import {
  createHelpSearchPlugin,
  createStaticArticleSearch,
} from "./help-search-plugin";

describe("help search on a live widget", () => {
  it("appends the card into the live welcome host and searches", async () => {
    const plugin = createHelpSearchPlugin({
      search: createStaticArticleSearch(
        [
          {
            id: "billing",
            title: "Update billing details",
            url: "https://example.com/help/billing",
            section: "Billing",
          },
        ],
        0,
      ),
      debounceMs: 0,
      resultAction: "ask",
    });

    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://example.com/api",
      persistState: false,
      plugins: [plugin],
      welcome: { title: "How can we help?", subtitle: "Search or ask." },
      suggestions: {
        starters: {
          items: [{ id: "order", label: "Where is my order?" }],
          placement: "welcome",
        },
      },
    });

    const welcome = mount.querySelector("[data-persona-welcome]");
    expect(welcome).not.toBeNull();
    const card = welcome?.querySelector(".help-search");
    expect(card).not.toBeNull();
    expect(welcome?.querySelector("h2")?.textContent).toBe("How can we help?");
    expect(welcome?.querySelectorAll(".persona-suggestion__label").length ?? 0)
      .toBeGreaterThan(0);

    const field = card?.querySelector<HTMLInputElement>(".help-search__input");
    field!.value = "billing";
    field!.dispatchEvent(new Event("input"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      welcome?.querySelectorAll(".help-search__result").length,
    ).toBe(1);

    // Live update re-arbitrates: exactly one card, query preserved.
    controller.update({ welcome: { variant: "hero" } });
    const cards = mount.querySelectorAll(".help-search");
    expect(cards).toHaveLength(1);
    expect(
      mount.querySelector<HTMLInputElement>(".help-search__input")?.value,
    ).toBe("billing");

    controller.destroy();
  });

  it("promotes results into the live starter row and restores the originals", async () => {
    const plugin = createHelpSearchPlugin({
      search: createStaticArticleSearch(
        [
          {
            id: "billing",
            title: "Update billing details",
            url: "https://example.com/help/billing",
            section: "Billing",
          },
        ],
        0,
      ),
      debounceMs: 0,
      promoteResultsToStarters: true,
    });

    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://example.com/api",
      persistState: false,
      plugins: [plugin],
      suggestions: {
        starters: {
          items: [{ id: "order", label: "Where is my order?" }],
          placement: "welcome",
        },
      },
    });
    plugin.attach(controller);

    const starterLabels = () =>
      Array.from(
        mount.querySelectorAll<HTMLElement>(".persona-suggestion__label"),
      ).map((label) => label.textContent);

    expect(starterLabels()).toEqual(["Where is my order?"]);

    const field = mount.querySelector<HTMLInputElement>(".help-search__input");
    field!.value = "billing";
    field!.dispatchEvent(new Event("input"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(starterLabels()).toEqual(["Update billing details"]);

    field!.value = "";
    field!.dispatchEvent(new Event("input"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(starterLabels()).toEqual(["Where is my order?"]);

    controller.destroy();
  });
});
