import { describe, it, expect } from "vitest";
import { generateCodeSnippet as fromSubpath } from "./codegen";
import { generateCodeSnippet as fromInternal } from "./utils/code-generators";
import { VERSION } from "./version";

// The `@runtypelabs/persona/codegen` subpath is the server/Worker-safe entry for
// snippet generation. It must expose the exact same generator as the internal
// module (and, transitively, the main barrel) — no fork, no drift.
describe("codegen subpath", () => {
  const config = {
    apiUrl: "https://api.example.com/chat",
    clientToken: "ct_test_123",
    launcher: { enabled: true, title: "Chat" },
  };

  it("re-exports the same generateCodeSnippet implementation", () => {
    expect(fromSubpath).toBe(fromInternal);
  });

  it("produces identical output via the subpath for every format", () => {
    const formats = [
      "esm",
      "script-installer",
      "script-manual",
      "script-advanced",
      "react-component",
      "react-advanced",
    ] as const;
    for (const format of formats) {
      expect(fromSubpath(config, format)).toBe(fromInternal(config, format));
    }
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

    it("serializes the selector into the installer data-config", () => {
      const code = fromSubpath(config, "script-installer", { target: "#chat" });
      expect(code).toContain('"target":"#chat"');
    });

    it("escapes single quotes in the selector so it can't break the literal", () => {
      const code = fromSubpath(config, "react-component", { target: "[data-x='y']" });
      expect(code).toContain("target: '[data-x=\\'y\\']'");
    });
  });
});
