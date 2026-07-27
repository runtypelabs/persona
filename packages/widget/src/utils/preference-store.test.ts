import { describe, expect, test, vi } from "vitest";
import { createFeaturePreferenceStore } from "./preference-store";

describe("createFeaturePreferenceStore", () => {
  test("loads untrusted stored JSON and reports issues without applying them", () => {
    const store = createFeaturePreferenceStore({
      base: { artifacts: { enabled: true, display: "collapsed" } },
      stored: {
        artifacts: { display: { files: "inline" }, enabled: false },
      },
    });
    expect(store.getLoadIssues().map((entry) => entry.path)).toEqual([
      "artifacts.enabled",
    ]);
    expect(store.getFeatures().artifacts).toMatchObject({
      enabled: true,
      display: { default: "collapsed", files: "inline" },
    });
  });

  test("setArtifactDisplay recomputes features and notifies subscribers with the persistable layer", () => {
    const onChange = vi.fn();
    const store = createFeaturePreferenceStore({
      base: { artifacts: { enabled: true } },
      layers: [
        {
          id: "organization",
          preferences: {
            artifacts: {
              display: { files: { byMediaType: { "text/csv": "panel" } } },
            },
          },
        },
      ],
      onChange,
    });

    store.setArtifactDisplay({ type: "files" }, "inline");

    // The blanket string replaces the organization's MIME exception.
    expect(store.getFeatures().artifacts?.display).toEqual({
      files: "inline",
    });
    expect(store.getPreferences()).toEqual({
      artifacts: { display: { files: "inline" } },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].preferences).toEqual(
      store.getPreferences()
    );
    expect(store.getArtifactDisplay({ type: "files" })).toBe("inline");
  });

  test("resolveArtifactDisplay attributes the writable layer by its configured id", () => {
    const store = createFeaturePreferenceStore({
      base: { artifacts: { enabled: true, display: "panel" } },
      storedLayerId: "member",
    });
    store.setArtifactDisplay(
      { type: "mediaType", mediaType: "image/*" },
      "inline"
    );
    expect(
      store.resolveArtifactDisplay({
        artifactType: "markdown",
        file: { path: "chart.png", mimeType: "image/png" },
      })
    ).toEqual({
      mode: "inline",
      matchedBy: { type: "mediaType", mediaType: "image/png", selector: "image/*" },
      source: { type: "preference", layerId: "member" },
    });
  });

  test("reset clears the writable layer and unsubscribe stops notifications", () => {
    const listener = vi.fn();
    const store = createFeaturePreferenceStore({});
    const unsubscribe = store.subscribe(listener);
    store.setArtifactDisplay({ type: "kind", kind: "component" }, "collapsed");
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getPreferences()).toEqual({});
  });
});
