// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, PersonaArtifactDisplayMode } from "./types";

beforeAll(() => {
  // jsdom does not implement matchMedia; the pane's layout code touches it.
  if (!window.matchMedia) {
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
  }
});

/**
 * Regression tests for the artifact pane auto-open gating by display mode
 * (docs/artifact-display-modes-spec.md, section 1 notes).
 *
 * The pane's own `update()` unhides its shell whenever records exist, so the
 * gate in `syncArtifactPane` must re-assert `persona-hidden` for artifacts
 * whose resolved mode is "card" or "inline". The original implementation only
 * removed the class in the show branch and never re-added it, so inline-mode
 * artifacts still auto-opened the pane.
 */
describe("artifact pane auto-open gating by display mode", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  function mountWithDisplay(display?: PersonaArtifactDisplayMode) {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const config: AgentWidgetConfig = {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown", "component"],
          ...(display ? { display } : {}),
        },
      },
    };
    const controller = createAgentExperience(mount, config);
    return { mount, controller };
  }

  function paneEl(mount: HTMLElement): HTMLElement {
    const el = mount.querySelector<HTMLElement>(".persona-artifact-pane");
    expect(el).not.toBeNull();
    return el!;
  }

  function upsertSample(controller: ReturnType<typeof createAgentExperience>) {
    controller.upsertArtifact({
      id: "gating-test",
      title: "Gating test",
      artifactType: "markdown",
      content: "# Hello",
    });
  }

  it('auto-opens the pane for "panel" mode (default)', () => {
    const { mount, controller } = mountWithDisplay();
    upsertSample(controller);
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(false);
    controller.destroy();
  });

  it('keeps the pane hidden for "inline" mode artifacts', () => {
    const { mount, controller } = mountWithDisplay("inline");
    upsertSample(controller);
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);
    controller.destroy();
  });

  it('keeps the pane hidden for "card" mode until an explicit open', () => {
    const { mount, controller } = mountWithDisplay("card");
    upsertSample(controller);
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(true);

    controller.showArtifacts();
    expect(paneEl(mount).classList.contains("persona-hidden")).toBe(false);
    controller.destroy();
  });
});
