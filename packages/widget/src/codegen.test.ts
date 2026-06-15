import { describe, it, expect } from "vitest";
import { generateCodeSnippet as fromSubpath } from "./codegen";
import { generateCodeSnippet as fromInternal } from "./utils/code-generators";
import { VERSION } from "./version";

// The `@runtypelabs/persona/codegen` subpath is the server/Worker-safe entry for
// snippet generation. It must expose the exact same generator as the internal
// module (and, transitively, the main barrel): no fork, no drift.
describe("codegen subpath", () => {
  const config = {
    apiUrl: "https://api.example.com/chat",
    clientToken: "ct_test_123",
    launcher: { enabled: true, title: "Chat" },
  };

  it("re-exports the same generateCodeSnippet implementation", () => {
    expect(fromSubpath).toBe(fromInternal);
  });

  it("pins the installer CDN url to the package version (not @latest)", () => {
    const code = fromSubpath(config, "script-installer");
    expect(code).toContain(`@runtypelabs/persona@${VERSION}/dist/install.global.js`);
    expect(code).not.toContain("@latest");
  });

  describe("mount target option", () => {
    it("defaults to body when no target is given", () => {
      expect(fromSubpath(config, "react-component")).toContain("target: 'body'");
      expect(fromSubpath(config, "script-manual")).toContain("target: 'body'");
      // installer omits the target key entirely (installer falls back to body)
      expect(fromSubpath(config, "script-installer")).not.toContain('"target"');
    });

    it("emits the selector as the initAgentWidget target for code formats", () => {
      const opts = { target: "#chat" };
      expect(fromSubpath(config, "esm", opts)).toContain("target: '#chat'");
      expect(fromSubpath(config, "react-component", opts)).toContain("target: '#chat'");
      expect(fromSubpath(config, "script-manual", opts)).toContain("target: '#chat'");
    });

    it("serializes the selector as a top-level installer option (sibling of config)", () => {
      // install.ts reads the mount point from the TOP LEVEL of data-config, not
      // from inside the widget config. Parse the emitted data-config and assert
      // the structure so a regression to the nested form is caught.
      const code = fromSubpath(config, "script-installer", { target: "#chat" });
      const json = code.match(/data-config='([^']*)'/)?.[1];
      expect(json).toBeTruthy();
      const parsed = JSON.parse(json!);
      expect(parsed.target).toBe("#chat");
      expect(parsed.config).toBeTruthy();
      // target must NOT be buried inside the widget config (where it's ignored)
      expect(parsed.config.target).toBeUndefined();
    });

    it("keeps target as a top-level sibling alongside windowKey", () => {
      const code = fromSubpath(config, "script-installer", { target: "#chat", windowKey: "myWidget" });
      const parsed = JSON.parse(code.match(/data-config='([^']*)'/)![1]);
      expect(parsed.target).toBe("#chat");
      expect(parsed.windowKey).toBe("myWidget");
      expect(parsed.config).toBeTruthy();
    });

    it("escapes single quotes in the selector so it can't break the literal", () => {
      const code = fromSubpath(config, "react-component", { target: "[data-x='y']" });
      expect(code).toContain("target: '[data-x=\\'y\\']'");
    });
  });
});
