// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAgentExperience } from "./ui";

// applyFullHeightStyles resets mount.style.cssText and re-applies the fill
// styles on every update, so the mount's shrinkable min-width has to be owned
// here (not only in the host layer, which it clobbers). Without it a wide
// artifact split forces the mount past its content-based minimum width. These
// tests drive the REAL controller so the reset/reapply actually runs (the
// init.ts handle tests use a mock controller and can't catch this).

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

describe("mount fill min-width (fullHeight embed)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps min-width:0 on the mount for a launcher-disabled fullHeight embed", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      launcher: { enabled: false, fullHeight: true },
    });
    expect(mount.style.minWidth).toBe("0px");
    controller.destroy();
  });

  it("restores min-width:0 after update() resets the mount cssText", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      launcher: { enabled: false, fullHeight: true },
    });
    expect(mount.style.minWidth).toBe("0px");

    // update() runs applyFullHeightStyles, which wipes mount.style.cssText and
    // re-applies the fill styles: min-width must come back, not stay cleared.
    controller.update({ colorScheme: "dark" });
    expect(mount.style.minWidth).toBe("0px");

    controller.destroy();
  });

  it("keeps min-width:0 on the mount in docked mode", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      launcher: { enabled: false, mountMode: "docked" },
    });
    expect(mount.style.minWidth).toBe("0px");
    controller.destroy();
  });
});
