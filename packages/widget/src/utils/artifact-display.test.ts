import { describe, it, expect } from "vitest";
import {
  resolveArtifactDisplay,
  resolveArtifactDisplayMode,
} from "./artifact-display";

describe("resolveArtifactDisplayMode", () => {
  const markdown = { artifactType: "markdown" as const };
  const component = { artifactType: "component" as const };

  it("returns 'panel' when the feature is undefined", () => {
    expect(resolveArtifactDisplayMode(undefined, markdown)).toBe("panel");
  });

  it("returns 'panel' when display is unset", () => {
    expect(resolveArtifactDisplayMode({ enabled: true }, markdown)).toBe("panel");
  });

  it("canonicalizes the deprecated 'card' alias to 'collapsed'", () => {
    expect(resolveArtifactDisplayMode({ display: "card" }, markdown)).toBe(
      "collapsed"
    );
    expect(
      resolveArtifactDisplayMode(
        { display: { files: "card" } },
        {
          artifactType: "markdown",
          file: { path: "a.txt", mimeType: "text/plain" },
        }
      )
    ).toBe("collapsed");
    expect(
      resolveArtifactDisplayMode(
        { display: { byKind: { component: "card" } } },
        component
      )
    ).toBe("collapsed");
  });

  it("returns the string form directly", () => {
    expect(resolveArtifactDisplayMode({ display: "inline" }, markdown)).toBe("inline");
    expect(resolveArtifactDisplayMode({ display: "collapsed" }, component)).toBe("collapsed");
  });

  it("uses the object default when no byKind entry matches", () => {
    expect(resolveArtifactDisplayMode({ display: { default: "collapsed" } }, markdown)).toBe("collapsed");
  });

  it("prefers a byKind override over the default", () => {
    const feature = {
      display: { default: "panel" as const, byKind: { markdown: "inline" as const } }
    };
    expect(resolveArtifactDisplayMode(feature, markdown)).toBe("inline");
  });

  it("falls back to the default on a byKind miss", () => {
    const feature = {
      display: { default: "collapsed" as const, byKind: { markdown: "inline" as const } }
    };
    expect(resolveArtifactDisplayMode(feature, component)).toBe("collapsed");
  });

  it("returns 'panel' for an object with neither default nor a matching byKind", () => {
    expect(resolveArtifactDisplayMode({ display: {} }, markdown)).toBe("panel");
    expect(
      resolveArtifactDisplayMode({ display: { byKind: { component: "inline" } } }, markdown)
    ).toBe("panel");
  });

  it("supports deprecated byType but lets canonical byKind win", () => {
    const feature = {
      display: {
        byType: { component: "collapsed" as const },
        byKind: { component: "inline" as const },
      },
    };
    expect(resolveArtifactDisplayMode(feature, component)).toBe("inline");
  });

  it("resolves exact MIME, wildcard MIME, files default, kind, and default precedence", () => {
    const feature = {
      display: {
        default: "collapsed" as const,
        byKind: { component: "panel" as const },
        files: {
          default: "collapsed" as const,
          byMediaType: {
            "text/html": "inline" as const,
            "image/*": "panel" as const,
          },
        },
      },
    };
    expect(
      resolveArtifactDisplayMode(feature, {
        artifactType: "markdown",
        file: { path: "a.html", mimeType: "Text/HTML; charset=utf-8" },
      })
    ).toBe("inline");
    expect(
      resolveArtifactDisplayMode(feature, {
        artifactType: "markdown",
        file: { path: "chart.png", mimeType: "image/png" },
      })
    ).toBe("panel");
    expect(
      resolveArtifactDisplayMode(feature, {
        artifactType: "markdown",
        file: { path: "a.txt", mimeType: "text/plain" },
      })
    ).toBe("collapsed");
    expect(resolveArtifactDisplayMode(feature, component)).toBe("panel");
    expect(resolveArtifactDisplayMode(feature, markdown)).toBe("collapsed");
  });

  it("prefers an exact MIME rule over a wildcard for the same major type", () => {
    const feature = {
      display: {
        files: {
          byMediaType: {
            "image/*": "collapsed" as const,
            "image/svg+xml": "inline" as const,
          },
        },
      },
    };
    expect(
      resolveArtifactDisplayMode(feature, {
        artifactType: "markdown",
        file: { path: "logo.svg", mimeType: "image/svg+xml" },
      })
    ).toBe("inline");
  });

  it("applies a files string to every file-backed artifact", () => {
    const feature = { display: { files: "inline" as const } };
    expect(
      resolveArtifactDisplayMode(feature, {
        artifactType: "markdown",
        file: { path: "a.csv", mimeType: "text/csv" },
      })
    ).toBe("inline");
    expect(resolveArtifactDisplayMode(feature, markdown)).toBe("panel");
  });

  it("honors the producer preferredMode hint over defaults but not explicit rules", () => {
    const hinted = {
      artifactType: "markdown" as const,
      presentation: { preferredMode: "inline" as const },
    };
    expect(resolveArtifactDisplayMode(undefined, hinted)).toBe("inline");
    expect(resolveArtifactDisplayMode({ display: "collapsed" }, hinted)).toBe(
      "inline"
    );
    expect(
      resolveArtifactDisplayMode({ display: { default: "collapsed" } }, hinted)
    ).toBe("inline");
    expect(
      resolveArtifactDisplayMode(
        { display: { byKind: { markdown: "panel" } } },
        hinted
      )
    ).toBe("panel");
    expect(
      resolveArtifactDisplayMode(
        { display: { files: "panel" } },
        { ...hinted, file: { path: "a.txt", mimeType: "text/plain" } }
      )
    ).toBe("panel");
  });

  it("returns the winning rule and configured selector for explainable host UI", () => {
    expect(
      resolveArtifactDisplay(
        {
          display: {
            files: {
              default: "panel",
              byMediaType: { "text/html": "inline" },
            },
          },
        },
        {
          artifactType: "markdown",
          file: { path: "a.html", mimeType: "Text/HTML; charset=utf-8" },
        }
      )
    ).toEqual({
      mode: "inline",
      matchedBy: {
        type: "mediaType",
        mediaType: "text/html",
        selector: "text/html",
      },
    });
    expect(
      resolveArtifactDisplay(
        { display: { files: { byMediaType: { "image/*": "inline" } } } },
        {
          artifactType: "markdown",
          file: { path: "a.png", mimeType: "image/png" },
        }
      ).matchedBy
    ).toEqual({ type: "mediaType", mediaType: "image/png", selector: "image/*" });
  });
});
