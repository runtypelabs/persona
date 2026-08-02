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
  mount.querySelector<HTMLElement>("#persona-scroll-container > .persona-flex.persona-flex-col.persona-gap-3")!;

describe("default content column", () => {
  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
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
