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
});
