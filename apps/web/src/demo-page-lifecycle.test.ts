// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { registerDemoPageLifecycle } from "./demo-page-lifecycle";

describe("demo document lifecycle", () => {
  it("preserves resources through repeated cached round trips and tears down once on departure", () => {
    const suspend = vi.fn();
    const resume = vi.fn();
    const destroy = vi.fn();
    registerDemoPageLifecycle({ suspend, resume, destroy });
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    expect(resume).not.toHaveBeenCalled();
    for (let cycle = 0; cycle < 3; cycle++) {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      expect(suspend).toHaveBeenCalledTimes(cycle + 1);
      expect(destroy).not.toHaveBeenCalled();
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      expect(resume).toHaveBeenCalledTimes(cycle + 1);
    }
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(destroy).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledTimes(3);
  });
});
