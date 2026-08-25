// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  animateComposerLiftChange,
  animateWelcomeOut,
  applyWelcomeConfig,
  applyWelcomeVisibility,
  buildGreetingHost,
  buildWelcomeHost,
  renderWelcomeGreeting,
} from "./welcome";
import { resolveWelcomeConfig } from "../welcome";
import type { AgentWidgetConfig } from "../types";

const makeHost = () => {
  const starters = document.createElement("div");
  return buildWelcomeHost(undefined, starters);
};

describe("welcome host", () => {
  it("carries the permanent host attributes", () => {
    const { host } = makeHost();
    expect(host.hasAttribute("data-persona-welcome")).toBe(true);
    expect(host.hasAttribute("data-persona-intro-card")).toBe(true);
  });

  it("gives the title and subtitle their tokenized typography classes", () => {
    const { title, subtitle } = makeHost();
    expect(title.tagName).toBe("H2");
    expect(title.className).toBe("persona-welcome-title");
    expect(subtitle.tagName).toBe("P");
    expect(subtitle.className).toBe("persona-welcome-subtitle");
  });

  it("applies resolved config in place", () => {
    const elements = makeHost();
    applyWelcomeConfig(
      elements,
      resolveWelcomeConfig({
        welcome: { title: "Hi", subtitle: "Scope", variant: "hero" },
      } as AgentWidgetConfig)
    );
    expect(elements.title.textContent).toBe("Hi");
    expect(elements.subtitle.textContent).toBe("Scope");
    expect(elements.host.getAttribute("data-persona-welcome-variant")).toBe(
      "hero"
    );
    expect(elements.host.getAttribute("data-persona-welcome-dismiss")).toBe(
      "on-first-message"
    );
  });

  it("tightens the body gap when the surface is hidden", () => {
    const { host } = makeHost();
    const body = document.createElement("div");
    body.className = "persona-gap-6";
    applyWelcomeVisibility(body, host, false);
    expect(body.classList.contains("persona-gap-3")).toBe(true);
    expect(body.classList.contains("persona-gap-6")).toBe(false);
    applyWelcomeVisibility(body, host, true);
    expect(body.classList.contains("persona-gap-6")).toBe(true);
    expect(host.hidden).toBe(false);
  });
});

describe("greeting bubble", () => {
  it("renders the greeting as plain text, never markup", () => {
    const host = buildGreetingHost();
    renderWelcomeGreeting(host, "<b>bold</b> & fine", undefined);
    expect(host.querySelector("b")).toBeNull();
    expect(host.textContent).toBe("<b>bold</b> & fine");
  });

  it("clears and hides when the greeting is removed", () => {
    const host = buildGreetingHost();
    renderWelcomeGreeting(host, "Hi", undefined);
    expect(host.hidden).toBe(false);
    renderWelcomeGreeting(host, undefined, undefined);
    expect(host.hidden).toBe(true);
    expect(host.childElementCount).toBe(0);
  });
});

describe("hero dismiss animation", () => {
  it("runs on the Web Animations API and settles after it finishes", async () => {
    const { host } = makeHost();
    document.body.appendChild(host);
    let resolveFinished: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const animate = vi.fn(
      (_keyframes: unknown, _options?: { fill?: string }) =>
        ({ finished }) as unknown as Animation
    );
    (host as unknown as { animate: typeof animate }).animate = animate;

    const onFinished = vi.fn();
    const animation = animateWelcomeOut(host, onFinished);
    expect(animate).toHaveBeenCalledTimes(1);
    // `forwards`: `backwards` only fills the delay phase, so the element would
    // flash back to opacity 1 after the keyframes end.
    expect(animate.mock.calls[0]![1]?.fill).toBe("forwards");
    expect(animation).toBeTruthy();
    expect(onFinished).not.toHaveBeenCalled();

    resolveFinished();
    await finished;
    await Promise.resolve();
    expect(onFinished).toHaveBeenCalledWith(animation);
    host.remove();
  });

  it("settles immediately without Web Animations support", () => {
    const { host } = makeHost();
    const onFinished = vi.fn();
    expect(animateWelcomeOut(host, onFinished)).toBeNull();
    expect(onFinished).toHaveBeenCalledWith(null);
  });
});

describe("composer lift animation", () => {
  const makeFooter = () => {
    const footer = document.createElement("div");
    document.body.appendChild(footer);
    return footer;
  };

  const stubAnimate = (footer: HTMLElement) => {
    const animate = vi.fn(
      (_keyframes: unknown, _options?: { fill?: string }) =>
        ({}) as unknown as Animation
    );
    (footer as unknown as { animate: typeof animate }).animate = animate;
    return animate;
  };

  it("travels on transform, never on bottom", () => {
    const footer = makeFooter();
    const animate = stubAnimate(footer);
    expect(animateComposerLiftChange(footer, 240, "drop")).toBeTruthy();
    const keyframes = animate.mock.calls[0]![0] as Array<Record<string, string>>;
    expect(keyframes).toEqual([
      { transform: "translateY(-240px)" },
      { transform: "none" },
    ]);
    // A fill would pin a stale transform across a later re-show.
    expect(animate.mock.calls[0]![1]?.fill).toBe("none");
    footer.remove();
  });

  it("reverses the travel for the rise", () => {
    const footer = makeFooter();
    const animate = stubAnimate(footer);
    animateComposerLiftChange(footer, 240, "rise");
    const keyframes = animate.mock.calls[0]![0] as Array<Record<string, string>>;
    expect(keyframes[0]!.transform).toBe("translateY(240px)");
    footer.remove();
  });

  it("skips sub-pixel travel", () => {
    const footer = makeFooter();
    stubAnimate(footer);
    expect(animateComposerLiftChange(footer, 1, "drop")).toBeNull();
    expect(animateComposerLiftChange(footer, 0, "rise")).toBeNull();
    footer.remove();
  });

  it("skips under prefers-reduced-motion", () => {
    const footer = makeFooter();
    stubAnimate(footer);
    // jsdom ships no matchMedia; the helper treats its absence as "no
    // preference", so the reduce path has to be installed explicitly.
    const original = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    expect(animateComposerLiftChange(footer, 240, "drop")).toBeNull();
    window.matchMedia = original;
    footer.remove();
  });

  it("skips a detached footer", () => {
    const footer = document.createElement("div");
    stubAnimate(footer);
    expect(animateComposerLiftChange(footer, 240, "drop")).toBeNull();
  });
});
