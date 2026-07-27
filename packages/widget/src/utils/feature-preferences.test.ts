import { describe, expect, test } from "vitest";
import {
  applyFeaturePreferencePatch,
  applyFeaturePreferences,
  createArtifactDisplayPreferencePatch,
  getArtifactDisplayPreference,
  mergeFeaturePreferences,
  parseWidgetPreferenceSlice,
  resolveArtifactDisplayPreference,
  type WidgetPreferenceLayer,
} from "./feature-preferences";
import type { WidgetPreferenceSlice } from "../types";

describe("feature preferences", () => {
  test("merges object display rules by selector key across layers", () => {
    expect(
      mergeFeaturePreferences([
        {
          showToolCalls: false,
          artifacts: {
            display: {
              default: "collapsed",
              byKind: { markdown: "panel" },
              files: { byMediaType: { "text/html": "inline" } },
            },
          },
        },
        {
          showToolCalls: undefined,
          artifacts: {
            display: {
              files: { default: "inline" },
              byKind: { component: "collapsed" },
            },
          },
        },
      ])
    ).toEqual({
      showToolCalls: false,
      artifacts: {
        display: {
          default: "collapsed",
          byKind: { markdown: "panel", component: "collapsed" },
          files: {
            default: "inline",
            byMediaType: { "text/html": "inline" },
          },
        },
      },
    });
  });

  test("a later-layer string replaces the whole subtree it names", () => {
    expect(
      mergeFeaturePreferences([
        {
          artifacts: {
            display: {
              default: "collapsed",
              files: { byMediaType: { "text/csv": "panel" } },
            },
          },
        },
        { artifacts: { display: { files: "inline" } } },
      ])
    ).toEqual({
      artifacts: {
        display: { default: "collapsed", files: "inline" },
      },
    });
    expect(
      mergeFeaturePreferences([
        { artifacts: { display: { default: "collapsed", files: "panel" } } },
        { artifacts: { display: "inline" } },
      ])
    ).toEqual({
      artifacts: { display: "inline" },
    });
  });

  test("canonicalizes the deprecated 'card' mode alias in stored preferences", () => {
    expect(
      parseWidgetPreferenceSlice({
        artifacts: {
          display: {
            default: "card",
            files: { byMediaType: { "text/csv": "card" } },
            byKind: { component: "card" },
          },
        },
      }).preferences
    ).toEqual({
      artifacts: {
        display: {
          default: "collapsed",
          files: { byMediaType: { "text/csv": "collapsed" } },
          byKind: { component: "collapsed" },
        },
      },
    });
    expect(
      createArtifactDisplayPreferencePatch({ type: "files" }, "card")
    ).toEqual({
      artifacts: { display: { files: "collapsed" } },
    });
  });

  test("normalizes the deprecated byType selector to byKind", () => {
    expect(
      parseWidgetPreferenceSlice({
        artifacts: {
          display: {
            byType: { markdown: "collapsed", component: "panel" },
            byKind: { component: "inline" },
          },
        },
      }).preferences
    ).toEqual({
      artifacts: {
        display: {
          byKind: { markdown: "collapsed", component: "inline" },
        },
      },
    });
  });

  test("gates capability-owned groups without mutating layers", () => {
    const layer = {
      showToolCalls: true,
      showReasoning: true,
      artifacts: { display: { default: "inline" as const } },
    };
    expect(
      mergeFeaturePreferences([layer], {
        capabilities: { artifacts: false, tools: false, reasoning: false },
      })
    ).toEqual({});
    expect(layer.artifacts.display.default).toBe("inline");
  });

  test("does not mutate inputs and ignores prototype-pollution keys", () => {
    const base = {
      artifacts: {
        display: {
          byKind: { markdown: "collapsed" as const },
        },
      },
    };
    const unsafe = JSON.parse(
      '{"artifacts":{"display":{"byKind":{"component":"inline"},"__proto__":{"polluted":true}}},"constructor":{"prototype":{"polluted":true}}}'
    );

    const merged = mergeFeaturePreferences([base, unsafe]);

    expect(merged).toEqual({
      artifacts: {
        display: {
          byKind: {
            markdown: "collapsed",
            component: "inline",
          },
        },
      },
    });
    expect(base).toEqual({
      artifacts: {
        display: {
          byKind: { markdown: "collapsed" },
        },
      },
    });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test("applies null resets and prunes empty containers", () => {
    const layer = {
      artifacts: {
        display: {
          files: "inline" as const,
          byKind: { component: "panel" as const },
        },
      },
    };
    const next = applyFeaturePreferencePatch(
      layer,
      createArtifactDisplayPreferencePatch({ type: "files" }, null)
    );
    expect(next).toEqual({
      artifacts: { display: { byKind: { component: "panel" } } },
    });
    expect(
      applyFeaturePreferencePatch(next, {
        artifacts: { display: { byKind: { component: null } } },
      })
    ).toEqual({});
  });

  test("allows only curated persisted fields at the runtime boundary", () => {
    const storedJson: unknown = {
      artifacts: {
        enabled: false,
        allowedTypes: [],
        display: {
          default: "sideways",
          files: "inline",
          unknownSelector: "panel",
        },
        filePreview: {
          enabled: false,
          iframeSandbox: "allow-same-origin allow-scripts",
          dangerouslyAllowSameOrigin: true,
        },
      },
      unknownRoot: true,
    };
    const parsed = parseWidgetPreferenceSlice(storedJson);
    expect(parsed.preferences).toEqual({
      artifacts: {
        display: { files: "inline" },
        filePreview: { enabled: false },
      },
    });
    expect(parsed.issues.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        "artifacts.enabled",
        "artifacts.allowedTypes",
        "artifacts.display.default",
        "artifacts.display.unknownSelector",
        "artifacts.filePreview.iframeSandbox",
        "artifacts.filePreview.dangerouslyAllowSameOrigin",
        "unknownRoot",
      ])
    );

    const result = applyFeaturePreferences(
      {
        artifacts: {
          enabled: true,
          allowedTypes: ["markdown"],
          filePreview: {
            iframeSandbox: "allow-scripts",
            dangerouslyAllowSameOrigin: false,
          },
        },
      },
      [storedJson as WidgetPreferenceSlice]
    );
    expect(result.artifacts).toMatchObject({
      enabled: true,
      allowedTypes: ["markdown"],
      display: { files: "inline" },
      filePreview: {
        enabled: false,
        iframeSandbox: "allow-scripts",
        dangerouslyAllowSameOrigin: false,
      },
    });
  });

  test("preserves base callbacks and the default from a string display config", () => {
    const onArtifactAction = () => true;
    const renderInline = () => document.createElement("div");
    const toolbarAction = {
      id: "export",
      label: "Export",
      onClick: () => undefined,
    };
    const result = applyFeaturePreferences(
      {
        artifacts: {
          display: "collapsed",
          onArtifactAction,
          renderInline,
          toolbarActions: [toolbarAction],
        },
      },
      [{ artifacts: { display: { files: "inline" } } }]
    );
    expect(result.artifacts).toMatchObject({
      display: { default: "collapsed", files: "inline" },
      onArtifactAction,
      renderInline,
      toolbarActions: [toolbarAction],
    });
  });

  test("creates and reads selector patches including normalized MIME types", () => {
    const patch = createArtifactDisplayPreferencePatch(
      { type: "mediaType", mediaType: "Text/HTML; charset=utf-8" },
      "inline"
    );
    const next = applyFeaturePreferencePatch({}, patch);
    expect(next).toEqual({
      artifacts: {
        display: { files: { byMediaType: { "text/html": "inline" } } },
      },
    });
    expect(
      getArtifactDisplayPreference(next, {
        type: "mediaType",
        mediaType: "TEXT/HTML",
      })
    ).toBe("inline");
    expect(
      createArtifactDisplayPreferencePatch(
        { type: "kind", kind: "component" },
        "collapsed"
      )
    ).toEqual({
      artifacts: { display: { byKind: { component: "collapsed" } } },
    });
  });

  test("promotes a stored files blanket to its default when a MIME exception is added", () => {
    const blanket = applyFeaturePreferencePatch(
      {},
      createArtifactDisplayPreferencePatch({ type: "files" }, "inline")
    );
    expect(blanket).toEqual({
      artifacts: { display: { files: "inline" } },
    });
    const withException = applyFeaturePreferencePatch(
      blanket,
      createArtifactDisplayPreferencePatch(
        { type: "mediaType", mediaType: "text/csv" },
        "panel"
      )
    );
    expect(withException).toEqual({
      artifacts: {
        display: {
          files: {
            default: "inline",
            byMediaType: { "text/csv": "panel" },
          },
        },
      },
    });
    // Resetting the files choice deletes only the default; exceptions survive.
    expect(
      applyFeaturePreferencePatch(
        withException,
        createArtifactDisplayPreferencePatch({ type: "files" }, null)
      )
    ).toEqual({
      artifacts: {
        display: { files: { byMediaType: { "text/csv": "panel" } } },
      },
    });
  });

  test("rejects invalid media-type selectors but accepts wildcards", () => {
    const parsed = parseWidgetPreferenceSlice({
      artifacts: {
        display: {
          files: {
            byMediaType: {
              "image/*": "inline",
              "*/*": "panel",
              "not a mime": "collapsed",
            },
          },
        },
      },
    });
    expect(parsed.preferences).toEqual({
      artifacts: {
        display: { files: { byMediaType: { "image/*": "inline" } } },
      },
    });
    expect(parsed.issues.map((entry) => entry.path)).toEqual([
      "artifacts.display.files.byMediaType.*/*",
      "artifacts.display.files.byMediaType.not a mime",
    ]);
  });

  test("explains the winning selector and preference layer", () => {
    const layers: WidgetPreferenceLayer[] = [
      {
        id: "organization",
        preferences: {
          artifacts: {
            display: {
              files: {
                default: "panel",
                byMediaType: { "text/html": "inline" },
              },
            },
          },
        },
      },
      {
        id: "user",
        preferences: {
          artifacts: { display: { files: { default: "collapsed" } } },
        },
      },
    ];
    // The user refined with the object form, so the organization's HTML
    // exception stays visible and is attributed to the organization.
    expect(
      resolveArtifactDisplayPreference(
        { display: "panel" },
        layers,
        {
          artifactType: "markdown",
          file: { path: "app.html", mimeType: "text/html" },
        }
      )
    ).toEqual({
      mode: "inline",
      matchedBy: {
        type: "mediaType",
        mediaType: "text/html",
        selector: "text/html",
      },
      source: { type: "preference", layerId: "organization" },
    });
    expect(
      resolveArtifactDisplayPreference(
        { display: "panel" },
        layers,
        {
          artifactType: "markdown",
          file: { path: "data.csv", mimeType: "text/csv" },
        }
      )
    ).toEqual({
      mode: "collapsed",
      matchedBy: { type: "files" },
      source: { type: "preference", layerId: "user" },
    });
  });

  test("a user files blanket beats lower-layer MIME exceptions and is attributed to the user", () => {
    const layers: WidgetPreferenceLayer[] = [
      {
        id: "organization",
        preferences: {
          artifacts: {
            display: {
              files: { byMediaType: { "text/html": "panel" } },
            },
          },
        },
      },
      {
        id: "user",
        preferences: {
          artifacts: { display: { files: "inline" } },
        },
      },
    ];
    expect(
      resolveArtifactDisplayPreference(undefined, layers, {
        artifactType: "markdown",
        file: { path: "app.html", mimeType: "text/html" },
      })
    ).toEqual({
      mode: "inline",
      matchedBy: { type: "files" },
      source: { type: "preference", layerId: "user" },
    });
  });

  test("attributes a producer preferredMode hint to the artifact", () => {
    expect(
      resolveArtifactDisplayPreference(
        { display: "collapsed" },
        [],
        {
          artifactType: "markdown",
          presentation: { preferredMode: "panel" },
        }
      )
    ).toEqual({
      mode: "panel",
      matchedBy: { type: "preferredMode" },
      source: { type: "artifact" },
    });
  });
});
