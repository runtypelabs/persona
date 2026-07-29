import { describe, expect, test } from "vitest";
import {
  applyFeaturePreferences,
  mergeFeaturePreferences,
  parseWidgetPreferenceSlice,
  resolveConfigPreferences,
} from "./feature-preferences";
import type { AgentWidgetConfig, WidgetPreferenceSlice } from "../types";

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
});

describe("resolveConfigPreferences", () => {
  test("returns the config unchanged when preferences are absent or empty", () => {
    const config: AgentWidgetConfig = {
      apiUrl: "https://api.example.com/chat",
      features: { artifacts: { enabled: true, display: "panel" } },
    };
    expect(resolveConfigPreferences(config)).toBe(config);
    const withEmpty = { ...config, preferences: {} };
    expect(resolveConfigPreferences(withEmpty)).toBe(withEmpty);
  });

  test("bakes preferences into features and keeps other config keys", () => {
    const resolved = resolveConfigPreferences({
      apiUrl: "https://api.example.com/chat",
      features: {
        artifacts: {
          enabled: true,
          display: { default: "panel", byKind: { component: "collapsed" } },
        },
      },
      preferences: { artifacts: { display: { default: "inline" } } },
    });
    expect(resolved.apiUrl).toBe("https://api.example.com/chat");
    expect(resolved.features?.artifacts?.enabled).toBe(true);
    expect(resolved.features?.artifacts?.display).toEqual({
      default: "inline",
      byKind: { component: "collapsed" },
    });
  });

  test("a string display preference replaces the base rule subtree", () => {
    const resolved = resolveConfigPreferences({
      features: {
        artifacts: {
          display: { default: "panel", byKind: { markdown: "collapsed" } },
        },
      },
      preferences: { artifacts: { display: "inline" } },
    });
    expect(resolved.features?.artifacts?.display).toBe("inline");
  });

  test("preferences cannot carry keys outside the allowlist", () => {
    const resolved = resolveConfigPreferences({
      features: {
        artifacts: { enabled: true, filePreview: { iframeSandbox: "allow-scripts" } },
      },
      preferences: {
        artifacts: {
          display: "inline",
          filePreview: { iframeSandbox: "allow-same-origin" },
        },
      } as unknown as WidgetPreferenceSlice,
    });
    expect(resolved.features?.artifacts?.filePreview?.iframeSandbox).toBe(
      "allow-scripts"
    );
    expect(resolved.features?.artifacts?.display).toBe("inline");
  });
});
