// @vitest-environment jsdom

/**
 * Instance-scoped keyboard shortcuts: the header trailing-action surface and
 * the plugin capability, both bound into the one registry the controller owns.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { setMacPlatformOverride } from "./utils/shortcuts";
import type { AgentWidgetPlugin } from "./plugins/types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];

const setup = (config: Record<string, unknown>) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const press = (target: EventTarget, key: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  );

describe("widget keyboard shortcuts", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    setMacPlatformOverride(false);
  });

  afterEach(() => {
    setMacPlatformOverride(null);
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("header trailing actions", () => {
    const withAction = (shortcut?: string) => {
      const onAction = vi.fn();
      const { mount, controller } = setup({
        layout: {
          header: {
            layout: "minimal",
            trailingActions: [
              {
                id: "home",
                icon: "house",
                ariaLabel: "Back to home",
                ...(shortcut ? { shortcut } : {}),
              },
            ],
            onAction,
          },
        },
      });
      return { mount, controller, onAction };
    };

    it("fires onAction from the declared combo", () => {
      const { mount, onAction } = withAction("mod+shift+h");
      const event = new KeyboardEvent("keydown", {
        key: "h",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      mount.dispatchEvent(event);
      expect(onAction).toHaveBeenCalledWith("home");
      expect(event.defaultPrevented).toBe(true);
    });

    it("binds nothing when the action declares no shortcut", () => {
      const { mount, onAction } = withAction();
      press(mount, "h");
      expect(onAction).not.toHaveBeenCalled();
    });

    it("re-derives the binding from a live update", () => {
      const { mount, controller, onAction } = withAction();
      controller.update({
        layout: {
          header: {
            layout: "minimal",
            trailingActions: [
              {
                id: "home",
                icon: "house",
                ariaLabel: "Back to home",
                shortcut: "mod+j",
              },
            ],
          },
        },
      } as never);
      press(mount, "j");
      expect(onAction).toHaveBeenCalledWith("home");
    });
  });

  describe("plugin shortcuts", () => {
    const plugin = (run: () => void): AgentWidgetPlugin => ({
      id: "demo",
      shortcuts: [{ id: "open", combo: "mod+j", run }],
    });

    it("binds on init and drops on destroy", () => {
      const run = vi.fn();
      const { mount, controller } = setup({ plugins: [plugin(run)] });
      press(mount, "j");
      expect(run).toHaveBeenCalledTimes(1);

      controller.destroy();
      press(mount, "j");
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("keeps a widget-scoped plugin binding out of the rest of the page", () => {
      const run = vi.fn();
      setup({ plugins: [plugin(run)] });
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      press(outside, "j");
      expect(run).not.toHaveBeenCalled();
    });

    it("honors an opt-in page scope", () => {
      const run = vi.fn();
      setup({
        plugins: [
          {
            id: "demo",
            shortcuts: [{ id: "open", combo: "mod+j", scope: "page", run }],
          } as AgentWidgetPlugin,
        ],
      });
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      press(outside, "j");
      expect(run).toHaveBeenCalledTimes(1);
    });
  });
});
