// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { createAgentExperience } from "./ui";

const originalInnerWidth = window.innerWidth;

const setInnerWidth = (value: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value,
  });
};

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

describe("createAgentExperience overlay z-index", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    setInnerWidth(originalInnerWidth);
  });

  it("defaults sidebar mode to the overlay z-index", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: {
        sidebarMode: true,
        position: "bottom-right",
      },
    });

    const wrapper = mount.firstElementChild as HTMLElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.zIndex).toBe("9999");

    controller.destroy();
  });

  it("defaults mobile fullscreen to the overlay z-index", () => {
    setInnerWidth(480);

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
    });

    const wrapper = mount.firstElementChild as HTMLElement | null;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.zIndex).toBe("9999");

    controller.destroy();
  });
});
