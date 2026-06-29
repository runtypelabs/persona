// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import {
  registerStreamAnimationPlugin,
  unregisterStreamAnimationPlugin,
} from "./utils/stream-animation";
import type { StreamAnimationPlugin } from "./types";

// A plugin animation carries its own CSS (built-in animations live in
// widget.css). Plugin styles are injected only via ensurePluginActive, which the
// initial mount runs but controller.update() historically skipped — so switching
// to a plugin animation live used to set the type without ever injecting the CSS.
const TEST_PLUGIN: StreamAnimationPlugin = {
  name: "test-reveal",
  containerClass: "test-reveal-stream",
  wrap: "char",
  styles: ".test-reveal-stream .persona-stream-char { opacity: 0; }",
};

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const styleTag = (mount: HTMLElement) =>
  mount.querySelector('style[data-persona-animation="test-reveal"]');

describe("createAgentExperience: stream-animation plugin activation on update()", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
    registerStreamAnimationPlugin(TEST_PLUGIN);
  });

  afterEach(() => {
    unregisterStreamAnimationPlugin("test-reveal");
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("injects a plugin animation's styles when switched in via update()", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { streamAnimation: { type: "none" } },
    });

    // Nothing injected while the type is "none".
    expect(styleTag(mount)).toBeNull();

    controller.update({
      features: { streamAnimation: { type: "test-reveal" } },
    });

    // The plugin's <style> is now present, so the animation can actually render.
    expect(styleTag(mount)).not.toBeNull();

    controller.destroy();
  });

  it("activates the plugin at mount when configured up front", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { streamAnimation: { type: "test-reveal" } },
    });

    expect(styleTag(mount)).not.toBeNull();
    controller.destroy();
  });

  it("does not duplicate the style tag when the same plugin is re-selected", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { streamAnimation: { type: "test-reveal" } },
    });

    controller.update({ features: { streamAnimation: { type: "none" } } });
    controller.update({ features: { streamAnimation: { type: "test-reveal" } } });

    expect(
      mount.querySelectorAll('style[data-persona-animation="test-reveal"]'),
    ).toHaveLength(1);

    controller.destroy();
  });
});
