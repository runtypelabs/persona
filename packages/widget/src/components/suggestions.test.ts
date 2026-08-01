// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSuggestions } from "./suggestions";
import type { AgentWidgetSession } from "../session";

const makeSession = (): AgentWidgetSession =>
  ({
    isStreaming: () => false,
    getMessages: () => [],
    sendMessage: () => {},
  }) as unknown as AgentWidgetSession;

const setup = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const textarea = document.createElement("textarea");
  document.body.appendChild(textarea);
  return {
    container,
    textarea,
    manager: createSuggestions(container),
    session: makeSession(),
  };
};

const withAnimate = (): ReturnType<typeof vi.fn> => {
  const animate = vi.fn(() => ({}));
  Object.defineProperty(Element.prototype, "animate", {
    value: animate,
    configurable: true,
    writable: true,
  });
  return animate;
};

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "animate");
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("suggestion entrance animation", () => {
  it("animates each item once for a newly shown set", () => {
    const animate = withAnimate();
    const { manager, session, textarea } = setup();

    manager.render(["One", "Two"], session, textarea, [], undefined, {
      variant: "card",
    });

    expect(animate).toHaveBeenCalledTimes(2);
    const [, secondOptions] = animate.mock.calls[1] as [
      unknown,
      { delay: number; duration: number; fill: string },
    ];
    expect(secondOptions.delay).toBe(60);
    expect(secondOptions.duration).toBe(250);
    expect(secondOptions.fill).toBe("backwards");
  });

  it("does not re-animate when render repeats the same items", () => {
    const animate = withAnimate();
    const { manager, session, textarea } = setup();
    const items = ["One", "Two"];

    manager.render(items, session, textarea, [], undefined, {
      variant: "card",
    });
    manager.render(items, session, textarea, [], undefined, {
      variant: "card",
    });

    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("animates again once the item set changes", () => {
    const animate = withAnimate();
    const { manager, session, textarea } = setup();

    manager.render(["One"], session, textarea, [], undefined, {
      variant: "card",
    });
    manager.render(["Two"], session, textarea, [], undefined, {
      variant: "card",
    });

    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("skips the animation under prefers-reduced-motion", () => {
    const animate = withAnimate();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    const { manager, session, textarea } = setup();

    manager.render(["One", "Two"], session, textarea, [], undefined, {
      variant: "card",
    });

    expect(animate).not.toHaveBeenCalled();
  });

  it("still renders when the platform has no Web Animations API", () => {
    const { container, manager, session, textarea } = setup();

    expect(typeof Element.prototype.animate).toBe("undefined");
    expect(() =>
      manager.render(["One", "Two"], session, textarea, [], undefined, {
        variant: "card",
      })
    ).not.toThrow();
    expect(container.querySelectorAll(".persona-suggestion")).toHaveLength(2);
  });
});
