// @vitest-environment jsdom

// End-to-end handle.update() through the REAL ui module (init.test.ts mocks it,
// so it cannot see the controller's own patch merge). Regression: explicit
// undefined resets must reach the controller, not be materialized as absent
// keys by the handle's pre-merge.

import { afterEach, describe, expect, it, vi } from "vitest";

import { initAgentWidget } from "./init";

describe("handle.update explicit-undefined reset reaches the controller", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("round-trips artifact pane appearance seamless -> panel via explicit undefined", () => {
    window.scrollTo = vi.fn();
    document.body.innerHTML = `<div id="target"></div>`;

    const handle = initAgentWidget({
      target: "#target",
      config: {
        apiUrl: "https://api.example.com/chat",
        launcher: { enabled: false },
        features: { artifacts: { enabled: true } },
      },
    });

    const root = () => document.querySelector<HTMLElement>("[data-persona-root]")!;
    expect(root().classList.contains("persona-artifact-appearance-panel")).toBe(true);

    handle.update({
      features: {
        artifacts: {
          layout: { paneAppearance: "seamless", splitGap: "0", paneShadow: "none" },
        },
      },
    });
    expect(root().classList.contains("persona-artifact-appearance-seamless")).toBe(true);

    handle.update({
      features: {
        artifacts: {
          layout: { paneAppearance: undefined, splitGap: undefined, paneShadow: undefined },
        },
      },
    });
    expect(root().classList.contains("persona-artifact-appearance-panel")).toBe(true);
    expect(root().classList.contains("persona-artifact-appearance-seamless")).toBe(false);
    expect(root().style.getPropertyValue("--persona-artifact-pane-shadow")).toBe("");

    handle.destroy();
  });

  it("handle and controller stored configs converge on the same merged result", () => {
    window.scrollTo = vi.fn();
    document.body.innerHTML = `<div id="target"></div>`;

    const handle = initAgentWidget({
      target: "#target",
      config: {
        apiUrl: "https://api.example.com/chat",
        launcher: { enabled: false, clearChat: { backgroundColor: "#123456" } },
      },
    });

    // Sibling override must survive an unrelated patch in BOTH layers: the
    // controller renders it now, and the handle's stored config must carry it
    // into a mount-mode rebuild. tooltipText also renames the aria-label.
    handle.update({ launcher: { clearChat: { tooltipText: "Wipe" } } });
    const clear = () => document.querySelector<HTMLButtonElement>('button[aria-label="Wipe"]')!;
    expect(clear().style.backgroundColor).toBe("rgb(18, 52, 86)");

    handle.update({ launcher: { mountMode: "docked" } });
    expect(clear().style.backgroundColor).toBe("rgb(18, 52, 86)");

    handle.destroy();
  });
});
