// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const setup = (config: AgentWidgetConfig) => {
  const mount = document.createElement("div");
  document.body.append(mount);
  const controller = createAgentExperience(mount, { launcher: { enabled: false }, persistState: false, ...config });
  controllers.push(controller);
  return { mount, controller };
};
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const formOf = (mount: HTMLElement) => mount.querySelector<HTMLElement>("[data-persona-composer-form]")!;
const suggestionsOf = (mount: HTMLElement) => mount.querySelector<HTMLElement>("[data-persona-composer-suggestions]")!;

describe("below composer starter suggestions", () => {
  beforeEach(() => { window.scrollTo = vi.fn(); });
  afterEach(() => { controllers.splice(0).forEach(controller => controller.destroy()); document.body.replaceChildren(); vi.restoreAllMocks(); });

  it("places starters outside and after the form, then hides them after a user message", async () => {
    const { mount, controller } = setup({ future: { v5Defaults: true }, suggestions: { starters: { placement: "below-composer", items: ["Write", "Learn"] } } });
    await flush();
    const suggestions = suggestionsOf(mount);
    expect(formOf(mount).nextElementSibling).toBe(suggestions);
    expect(suggestions.hasAttribute("data-persona-suggestions-below")).toBe(true);
    expect(suggestions.querySelectorAll("button")).toHaveLength(2);
    controller.injectUserMessage({ content: "Hello" });
    await flush();
    expect(suggestions.querySelectorAll("button")).toHaveLength(0);
  });

  it("restores above-composer placement when updated to legacy V4 starters", async () => {
    const { mount, controller } = setup({ suggestions: { starters: { placement: "below-composer", items: ["Write"] } } });
    await flush();
    controller.update({ suggestions: undefined, suggestionChips: ["Legacy"] });
    await flush();
    const suggestions = suggestionsOf(mount);
    expect(suggestions.hasAttribute("data-persona-suggestions-below")).toBe(false);
    expect(suggestions.nextElementSibling).toBe(formOf(mount));
    expect(suggestions.textContent).toContain("Legacy");
  });

  it("keeps host follow-ups above the composer after below-composer starters", async () => {
    const { mount, controller } = setup({ suggestions: { starters: { placement: "below-composer", items: ["Write"] }, followUps: { placement: "composer" } } });
    await flush();
    controller.setFollowUpSuggestions(["Continue"]);
    await flush();
    const suggestions = suggestionsOf(mount);
    expect(suggestions.hasAttribute("data-persona-suggestions-below")).toBe(false);
    expect(suggestions.nextElementSibling).toBe(formOf(mount));
    expect(suggestions.textContent).toContain("Continue");
  });
});
