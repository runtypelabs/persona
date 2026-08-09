// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

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

const wrapper = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("#persona-scroll-container > .persona-widget-messages")!;

describe("default content column", () => {
  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
  });

  it("keeps the transcript wrapper :empty pre-conversation so CSS drops it from the flex flow", () => {
    // The stylesheet's .persona-widget-messages:empty { display: none } only
    // works if nothing seeds the wrapper with placeholder nodes.
    const { mount, controller } = makeController();
    const messagesWrapper = wrapper(mount);
    expect(messagesWrapper.matches(":empty")).toBe(true);

    controller.injectUserMessage({ content: "hi" });
    expect(messagesWrapper.matches(":empty")).toBe(false);
  });

  it("caps and centers the transcript at 768px by default", () => {
    const { mount } = makeController();
    const messagesWrapper = wrapper(mount);
    expect(messagesWrapper.style.maxWidth).toBe("768px");
    expect(messagesWrapper.style.marginLeft).toBe("auto");
    expect(messagesWrapper.style.marginRight).toBe("auto");
    expect(messagesWrapper.style.width).toBe("100%");
  });

  it("honors an explicit layout.contentMaxWidth", () => {
    const { mount } = makeController({ layout: { contentMaxWidth: "90ch" } });
    expect(wrapper(mount).style.maxWidth).toBe("90ch");
  });

  it("opts out with \"none\" for a full-width column", () => {
    const { mount } = makeController({ layout: { contentMaxWidth: "none" } });
    expect(wrapper(mount).style.maxWidth).toBe("none");
  });

  it("caps the composer status text to the same column as the composer form", () => {
    const { mount, controller } = makeController();
    const statusText = mount.querySelector<HTMLElement>("[data-persona-composer-status]")!;
    expect(statusText.style.maxWidth).toBe("768px");
    expect(statusText.style.marginLeft).toBe("auto");
    expect(statusText.style.marginRight).toBe("auto");

    controller.update({ layout: { contentMaxWidth: "90ch" } });
    expect(statusText.style.maxWidth).toBe("90ch");

    controller.update({ layout: { contentMaxWidth: "" } });
    expect(statusText.style.maxWidth).toBe("");
    expect(statusText.style.marginLeft).toBe("");
  });

  it("left-aligns the attachment preview strip inside the capped column", () => {
    // The repro: a stage wider than the 768px cap. The previews row lives in
    // the composer header, which is `display: contents`, so it is really a flex
    // ITEM of the column-flex form. Auto cross margins on a flex item shrink it
    // to its content, which centered a single 48px tile.
    const { mount } = makeController({ attachments: { enabled: true } });
    mount.style.width = "1200px";
    const previews = mount.querySelector<HTMLElement>(
      "[data-persona-composer-attachment-previews]"
    )!;
    const form = mount.querySelector<HTMLElement>("[data-persona-composer-form]")!;

    // Capped to the same column as the composer form...
    expect(previews.style.maxWidth).toBe("768px");
    expect(form.style.maxWidth).toBe("768px");
    // ...and told to fill it, so tiles start at the column's leading edge
    // instead of the row shrink-wrapping around them.
    expect(previews.style.width).toBe("100%");
    expect(previews.style.marginLeft).toBe("auto");
    expect(previews.style.marginRight).toBe("auto");
  });

  it("gives every centered composer child an explicit width", () => {
    const { mount } = makeController({ attachments: { enabled: true } });
    const selectors = [
      "[data-persona-composer-form]",
      "[data-persona-composer-suggestions]",
      "[data-persona-composer-attachment-previews]",
      "[data-persona-composer-status]",
    ];
    for (const selector of selectors) {
      const element = mount.querySelector<HTMLElement>(selector)!;
      expect(element, selector).toBeTruthy();
      expect(element.style.width, selector).toBe("100%");
      expect(element.style.maxWidth, selector).toBe("768px");
    }
  });

  it("keeps the previews strip in sync through controller.update()", () => {
    const { mount, controller } = makeController({ attachments: { enabled: true } });
    const previews = mount.querySelector<HTMLElement>(
      "[data-persona-composer-attachment-previews]"
    )!;

    controller.update({ layout: { contentMaxWidth: "90ch" } });
    expect(previews.style.maxWidth).toBe("90ch");
    expect(previews.style.width).toBe("100%");

    // "none" opts out of the cap but still fills the row.
    controller.update({ layout: { contentMaxWidth: "none" } });
    expect(previews.style.maxWidth).toBe("none");
    expect(previews.style.width).toBe("100%");

    // An unresolvable value clears the centering entirely.
    controller.update({ layout: { contentMaxWidth: "" } });
    expect(previews.style.maxWidth).toBe("");
    expect(previews.style.width).toBe("");
    expect(previews.style.marginLeft).toBe("");
  });

  it("publishes the resolved column as a CSS var for plugin content", () => {
    const { mount, controller } = makeController();
    expect(
      mount.style.getPropertyValue("--persona-content-max-width")
    ).toBe("768px");

    controller.update({ layout: { contentMaxWidth: "90ch" } });
    expect(
      mount.style.getPropertyValue("--persona-content-max-width")
    ).toBe("90ch");
  });
});
