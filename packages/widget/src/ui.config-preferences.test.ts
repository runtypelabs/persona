// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAgentExperience } from "./ui";
import type {
  AgentWidgetArtifactsFeature,
  AgentWidgetConfig,
  WidgetPreferenceSlice,
} from "./types";

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
 * Config-level `preferences` are per-instance display overrides baked over
 * `features` (utils/feature-preferences.ts `resolveConfigPreferences`). The
 * pane's auto-open state is the observable for the effective display mode:
 * "panel" opens it on upsert, "inline"/"collapsed" keep it hidden.
 *
 * The update() path must re-resolve from the pre-preference base features:
 * changing or clearing preferences may not stack onto previously overlaid
 * values.
 */
describe("config preferences overrides", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    try {
      window.localStorage.clear();
    } catch {
      /* jsdom edge cases */
    }
  });

  function mountWith(
    display: AgentWidgetArtifactsFeature["display"],
    preferences?: WidgetPreferenceSlice
  ) {
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
      ...(preferences ? { preferences } : {}),
    };
    const controller = createAgentExperience(mount, config);
    return { mount, controller };
  }

  function paneHidden(mount: HTMLElement): boolean {
    const el = mount.querySelector<HTMLElement>(".persona-artifact-pane");
    expect(el).not.toBeNull();
    return el!.classList.contains("persona-hidden");
  }

  function upsertSample(
    controller: ReturnType<typeof createAgentExperience>,
    id = "prefs-test"
  ) {
    controller.upsertArtifact({
      id,
      title: "Preferences test",
      artifactType: "markdown",
      content: "# Hello",
    });
  }

  it("applies initial preferences over base features", () => {
    // Base says panel (auto-open); the instance preference says inline.
    const { mount, controller } = mountWith("panel", {
      artifacts: { display: "inline" },
    });
    upsertSample(controller);
    expect(paneHidden(mount)).toBe(true);
    controller.destroy();
  });

  it("applies preferences passed through controller.update()", () => {
    const { mount, controller } = mountWith("panel");
    controller.update({ preferences: { artifacts: { display: "collapsed" } } });
    upsertSample(controller);
    expect(paneHidden(mount)).toBe(true);
    controller.destroy();
  });

  // A "panel" upsert marks the pane user-opened, which is sticky by design,
  // so the remaining tests observe the effective mode through the transcript
  // block type instead: refreshArtifactReferenceBlocks re-materializes blocks
  // on a live display change ("inline" → .persona-artifact-inline preview,
  // otherwise the reference card).
  function inlineBlockCount(mount: HTMLElement): number {
    return mount.querySelectorAll(".persona-artifact-inline").length;
  }

  it("clearing preferences reverts to the base features", () => {
    const { mount, controller } = mountWith("inline", {
      artifacts: { display: "panel" },
    });
    upsertSample(controller);
    expect(inlineBlockCount(mount)).toBe(0);

    // Explicit-undefined deletes the key (config-merge reset semantics); the
    // effective mode must fall back to the base "inline", not keep "panel".
    controller.update({ preferences: undefined });
    expect(inlineBlockCount(mount)).toBe(1);
    controller.destroy();
  });

  it("replacing preferences re-resolves from the base, not the prior overlay", () => {
    const { mount, controller } = mountWith(
      { default: "collapsed", byKind: { markdown: "inline" } },
      { artifacts: { display: "panel" } }
    );
    upsertSample(controller);
    expect(inlineBlockCount(mount)).toBe(0);

    // The object-form preference refines the base, so byKind.markdown →
    // "inline" survives and the block converts to an inline preview. If the
    // prior "panel" string overlay had been folded into the base, byKind
    // would be gone and this would resolve "collapsed" (a card).
    controller.update({
      preferences: { artifacts: { display: { default: "collapsed" } } },
    });
    expect(inlineBlockCount(mount)).toBe(1);
    controller.destroy();
  });
});
