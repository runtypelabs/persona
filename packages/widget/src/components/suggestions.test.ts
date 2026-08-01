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

describe("legacy suggestionChipsConfig scoping", () => {
  const chipsConfig = {
    fontFamily: "sans-serif" as const,
    fontWeight: "500",
    paddingX: "12px",
    paddingY: "6px",
  };

  it("applies inline chip styles to the chip variant", () => {
    const { manager, session, textarea, container } = setup();

    manager.render(["One"], session, textarea, [], chipsConfig, {
      variant: "chip",
    });

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.style.paddingLeft).toBe("12px");
    expect(button.style.paddingTop).toBe("6px");
    expect(button.style.fontWeight).toBe("500");
  });

  it("does not let chip config override card and list padding tokens", () => {
    const { manager, session, textarea, container } = setup();

    for (const variant of ["card", "list"] as const) {
      manager.render(["One"], session, textarea, [], chipsConfig, { variant });
      const button = container.querySelector("button") as HTMLButtonElement;
      expect(button.style.paddingLeft).toBe("");
      expect(button.style.paddingTop).toBe("");
      expect(button.style.fontFamily).toBe("");
    }
  });
});
