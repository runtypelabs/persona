import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { AgentWidgetConfig } from "../types";
import { DEFAULT_WIDGET_CONFIG } from "../defaults";
import { createTheme, themeToCssVariables } from "./tokens";
import { generateCodeSnippet, type CodeFormat, type CodeGeneratorHooks, type CodeGeneratorOptions as _CodeGeneratorOptions } from "./code-generators";
import { VERSION } from "../version";

// =============================================================================
// Test Fixtures
// =============================================================================

const minimalConfig = {
  apiUrl: "https://api.example.com/chat",
};

const fullConfig = {
  apiUrl: "https://api.example.com/chat",
  flowId: "test-flow-123",
  theme: {
    palette: {
      colors: {
        primary: {
          500: "#007bff",
        },
      },
      typography: {
        fontFamily: {
          sans: "Inter, sans-serif",
        },
      },
    },
  },
  messageActions: {
    enableCopy: true,
    enableFeedback: true,
    feedbackType: "thumbs",
  },
};

const dockedConfig = {
  apiUrl: "https://api.example.com/chat",
  launcher: {
    mountMode: "docked",
    dock: {
      side: "left",
      width: "480px",
    },
  },
};

// =============================================================================
// Hook Serialization Tests
// =============================================================================

describe("Hook Serialization", () => {
  describe("string hooks", () => {
    it("should pass string hooks through unchanged in ESM format", () => {
      const hooks: CodeGeneratorHooks = {
        getHeaders: "async () => ({ 'Authorization': 'Bearer token' })",
      };

      const code = generateCodeSnippet(minimalConfig, "esm", { hooks });

      expect(code).toContain("getHeaders: async () => ({ 'Authorization': 'Bearer token' })");
    });

    it("should pass string hooks through unchanged in React format", () => {
      const hooks: CodeGeneratorHooks = {
        getHeaders: "async () => ({ 'X-Custom': 'value' })",
      };

      const code = generateCodeSnippet(minimalConfig, "react-component", { hooks });

      expect(code).toContain("getHeaders: async () => ({ 'X-Custom': 'value' })");
    });
  });

  describe("function hooks", () => {
    it("should serialize single function to string", () => {
      const hooks: CodeGeneratorHooks = {
        getHeaders: async () => ({ 'Authorization': 'Bearer token' }),
      };

      const code = generateCodeSnippet(minimalConfig, "esm", { hooks });

      // Function should be serialized
      expect(code).toContain("getHeaders:");
      expect(code).toContain("Authorization");
    });

    it("should serialize arrow function with body", () => {
      const hooks: CodeGeneratorHooks = {
        onFeedback: (feedback) => {
          console.log('Feedback received:', feedback);
        },
      };

      const code = generateCodeSnippet(minimalConfig, "esm", { hooks });

      expect(code).toContain("onFeedback:");
      expect(code).toContain("console.log");
    });

    it("should serialize array of functions", () => {
      const hooks: CodeGeneratorHooks = {
        actionHandlers: [
          (action: any, _ctx: any) => {
            if (action.type === 'custom') {
              return { handled: true };
            }
          },
          (action: any, _ctx: any) => {
            if (action.type === 'another') {
              return { handled: true, displayText: 'Done' };
            }
          },
        ],
      };

      const code = generateCodeSnippet(minimalConfig, "esm", { hooks });

      // Should contain the actionHandlers array with serialized functions
      expect(code).toContain("actionHandlers:");
      // When functions are serialized, they contain the function body
      expect(code).toContain("custom");
      expect(code).toContain("another");
    });
  });
});

// =============================================================================
// Format-Specific Hook Injection Tests
// =============================================================================

describe("ESM Format Hooks", () => {
  it("serializes nested PersonaTheme (semantic + components)", () => {
    const code = generateCodeSnippet(
      {
        apiUrl: "https://api.example.com/chat",
        theme: {
          semantic: {
            colors: {
              primary: "palette.colors.primary.500",
            },
          },
          components: {
            panel: {
              shadow: "none",
              borderRadius: "0",
            },
          },
        },
      },
      "esm"
    );
    expect(code).toContain("semantic:");
    expect(code).toContain("palette.colors.primary.500");
    expect(code).toContain("components:");
    expect(code).toContain("panel:");
    expect(code).toContain('"none"');
  });

  it("should serialize docked launcher config", () => {
    const code = generateCodeSnippet(dockedConfig, "esm");

    expect(code).toContain('mountMode: "docked"');
    expect(code).toContain('dock: {');
    expect(code).toContain('side: "left"');
    expect(code).toContain('width: "480px"');
    expect(code).not.toContain("collapsedWidth");
  });

  it("should inject getHeaders hook", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        getHeaders: "async () => ({ 'X-API-Key': 'secret123' })",
      },
    });

    expect(code).toContain("getHeaders: async () => ({ 'X-API-Key': 'secret123' })");
  });

  it("should inject postprocessMessage hook", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        postprocessMessage: "({ text }) => text.toUpperCase()",
      },
    });

    expect(code).toContain("postprocessMessage: ({ text }) => text.toUpperCase()");
  });

  it("should inject requestMiddleware hook", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        requestMiddleware: "({ payload }) => ({ ...payload, timestamp: Date.now() })",
      },
    });

    expect(code).toContain("requestMiddleware: ({ payload }) => ({ ...payload, timestamp: Date.now() })");
  });

  it("should inject streamParser hook", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        streamParser: "() => createCustomParser()",
      },
    });

    expect(code).toContain("streamParser: () => createCustomParser()");
  });

  it("should inject multiple hooks simultaneously", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        getHeaders: "async () => ({ 'Auth': 'token' })",
        postprocessMessage: "({ text }) => text",
        requestMiddleware: "({ payload }) => payload",
      },
    });

    expect(code).toContain("getHeaders: async () => ({ 'Auth': 'token' })");
    expect(code).toContain("postprocessMessage: ({ text }) => text");
    expect(code).toContain("requestMiddleware: ({ payload }) => payload");
  });
});

describe("React Component Format Hooks", () => {
  it("should serialize docked launcher config in React component format", () => {
    const code = generateCodeSnippet(dockedConfig, "react-component");

    expect(code).toContain('mountMode: "docked"');
    expect(code).toContain('dock: {');
    expect(code).toContain('side: "left"');
    expect(code).toContain('width: "480px"');
    expect(code).not.toContain("collapsedWidth");
  });

  it("should inject hooks in React component format", () => {
    const code = generateCodeSnippet(minimalConfig, "react-component", {
      hooks: {
        getHeaders: "async () => ({ 'Authorization': 'Bearer xyz' })",
      },
    });

    expect(code).toContain("getHeaders: async () => ({ 'Authorization': 'Bearer xyz' })");
    expect(code).toContain("import");
    expect(code).toContain("useEffect");
  });

  it("should inject onFeedback and onCopy hooks in messageActions", () => {
    const code = generateCodeSnippet(fullConfig, "react-component", {
      hooks: {
        onFeedback: "(feedback) => console.log('feedback', feedback)",
        onCopy: "(msg) => console.log('copied', msg)",
      },
    });

    expect(code).toContain("onFeedback: (feedback) => console.log('feedback', feedback)");
    expect(code).toContain("onCopy: (msg) => console.log('copied', msg)");
  });
});

describe("React Advanced Format Hooks", () => {
  it("should serialize docked launcher config in React advanced format", () => {
    const code = generateCodeSnippet(dockedConfig, "react-advanced");

    expect(code).toContain('mountMode: "docked"');
    expect(code).toContain('dock: {');
    expect(code).toContain('side: "left"');
    expect(code).toContain('width: "480px"');
    expect(code).not.toContain("collapsedWidth");
  });

  it("should inject custom action handlers alongside defaults", () => {
    const code = generateCodeSnippet(minimalConfig, "react-advanced", {
      hooks: {
        actionHandlers: `[(action, ctx) => {
          if (action.type === 'my_action') return { handled: true };
        }]`,
      },
    });

    // Should contain both custom handler and default nav_then_click handler
    expect(code).toContain("my_action");
    expect(code).toContain("nav_then_click");
  });

  it("should inject custom action parsers alongside defaults", () => {
    const code = generateCodeSnippet(minimalConfig, "react-advanced", {
      hooks: {
        actionParsers: `[(ctx) => {
          if (ctx.text.includes('SPECIAL')) return { type: 'special' };
        }]`,
      },
    });

    expect(code).toContain("SPECIAL");
  });

  it("should merge requestMiddleware with DOM context collection", () => {
    const code = generateCodeSnippet(minimalConfig, "react-advanced", {
      hooks: {
        requestMiddleware: "({ payload }) => ({ ...payload, extra: 'data' })",
      },
    });

    // Should contain both custom middleware and DOM context collection
    expect(code).toContain("extra: 'data'");
    // TypeScript version uses collectDOMContext()
    expect(code).toContain("collectDOMContext");
  });

  it("should inject context providers", () => {
    const code = generateCodeSnippet(minimalConfig, "react-advanced", {
      hooks: {
        contextProviders: `[() => ({ userAgent: navigator.userAgent })]`,
      },
    });

    expect(code).toContain("userAgent: navigator.userAgent");
  });
});

describe("Script Manual Format Hooks", () => {
  it("should serialize docked launcher config in script-manual format", () => {
    const code = generateCodeSnippet(dockedConfig, "script-manual");

    expect(code).toContain('mountMode: "docked"');
    expect(code).toContain('dock: {');
    expect(code).toContain('side: "left"');
    expect(code).toContain('width: "480px"');
    expect(code).not.toContain("collapsedWidth");
  });

  it("should inject hooks in script-manual format", () => {
    const code = generateCodeSnippet(minimalConfig, "script-manual", {
      hooks: {
        getHeaders: "async function() { return { 'X-Key': 'value' }; }",
      },
    });

    expect(code).toContain("getHeaders: async function() { return { 'X-Key': 'value' }; }");
    expect(code).toContain("<script");
  });

  it("should inject postprocessMessage hook", () => {
    const code = generateCodeSnippet(minimalConfig, "script-manual", {
      hooks: {
        postprocessMessage: "function({ text }) { return text.trim(); }",
      },
    });

    expect(code).toContain("postprocessMessage: function({ text }) { return text.trim(); }");
  });
});

describe("Script Advanced Format Hooks", () => {
  it("should inject custom action handlers alongside defaults", () => {
    const code = generateCodeSnippet(minimalConfig, "script-advanced", {
      hooks: {
        actionHandlers: `[function(action, ctx) {
          if (action.type === 'custom_action') return { handled: true };
        }]`,
      },
    });

    // Should contain both custom handler and default nav_then_click handler
    expect(code).toContain("custom_action");
    expect(code).toContain("nav_then_click");
  });

  it("should merge requestMiddleware with DOM context collection", () => {
    const code = generateCodeSnippet(minimalConfig, "script-advanced", {
      hooks: {
        requestMiddleware: "function(ctx) { ctx.payload.custom = true; return ctx.payload; }",
      },
    });

    // Should contain both custom middleware and DOM context collection
    expect(code).toContain("custom = true");
    // ES5 version uses domContextProvider()
    expect(code).toContain("domContextProvider");
  });
});

describe("Script Installer Format", () => {
  it("should not inject hooks (JSON-only config)", () => {
    const code = generateCodeSnippet(minimalConfig, "script-installer", {
      hooks: {
        getHeaders: "async () => ({ 'Auth': 'token' })",
      },
    });

    // Script installer uses JSON config, should not have function hooks
    expect(code).not.toContain("getHeaders:");
    expect(code).toContain("data-config");
  });
});

// =============================================================================
// Client Token Emission Tests
// =============================================================================

describe("Client Token Config", () => {
  const clientTokenConfig = {
    ...minimalConfig,
    clientToken: "ct_test_123",
  };

  it("should include clientToken in ESM format", () => {
    const code = generateCodeSnippet(clientTokenConfig, "esm");
    expect(code).toContain('clientToken: "ct_test_123"');
  });

  it("should include clientToken in React component format", () => {
    const code = generateCodeSnippet(clientTokenConfig, "react-component");
    expect(code).toContain('clientToken: "ct_test_123"');
  });

  it("should include clientToken in React advanced format", () => {
    const code = generateCodeSnippet(clientTokenConfig, "react-advanced");
    expect(code).toContain('clientToken: "ct_test_123"');
  });

  it("should include clientToken in script-manual format", () => {
    const code = generateCodeSnippet(clientTokenConfig, "script-manual");
    expect(code).toContain('clientToken: "ct_test_123"');
  });

  it("should include clientToken in script-advanced format (CONFIG JSON)", () => {
    const code = generateCodeSnippet(clientTokenConfig, "script-advanced");
    expect(code).toContain('"clientToken": "ct_test_123"');
  });

  it("should include clientToken in script-installer format (data-config JSON)", () => {
    const code = generateCodeSnippet(clientTokenConfig, "script-installer");
    expect(code).toContain('"clientToken":"ct_test_123"');
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe("Edge Cases", () => {
  it("should handle empty hooks object", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", { hooks: {} });

    // Should generate valid code without any hooks
    expect(code).toContain("initAgentWidget");
    expect(code).not.toContain("getHeaders:");
  });

  it("should handle undefined hooks", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", { hooks: undefined });

    expect(code).toContain("initAgentWidget");
  });

  it("should handle options without hooks", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", { includeHookComments: false });

    expect(code).toContain("initAgentWidget");
  });

  it("should handle all formats without errors", () => {
    const formats: CodeFormat[] = [
      "esm",
      "script-installer",
      "script-manual",
      "script-advanced",
      "react-component",
      "react-advanced",
    ];

    const hooks: CodeGeneratorHooks = {
      getHeaders: "async () => ({})",
    };

    for (const format of formats) {
      expect(() => generateCodeSnippet(minimalConfig, format, { hooks })).not.toThrow();
    }
  });

  it("should preserve special characters in hook strings", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        getHeaders: "async () => ({ 'Content-Type': 'application/json; charset=utf-8' })",
      },
    });

    expect(code).toContain("application/json; charset=utf-8");
  });

  it("should handle multiline hook strings", () => {
    const code = generateCodeSnippet(minimalConfig, "esm", {
      hooks: {
        onFeedback: `(feedback) => {
          const { type, messageId } = feedback;
          fetch('/api/feedback', {
            method: 'POST',
            body: JSON.stringify({ type, messageId })
          });
        }`,
      },
    });

    expect(code).toContain("fetch('/api/feedback'");
    expect(code).toContain("JSON.stringify");
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Full Config with Hooks Integration", () => {
  it("should generate complete ESM code with config and hooks", () => {
    const code = generateCodeSnippet(fullConfig, "esm", {
      hooks: {
        getHeaders: "async () => ({ 'Authorization': `Bearer ${localStorage.getItem('token')}` })",
        onFeedback: "(feedback) => analytics.track('feedback', feedback)",
        postprocessMessage: "({ text }) => DOMPurify.sanitize(text)",
      },
    });

    // Config properties that are included in generated code
    expect(code).toContain("#007bff");
    expect(code).toContain("Inter, sans-serif");

    // Hooks
    expect(code).toContain("localStorage.getItem('token')");
    expect(code).toContain("analytics.track");
    expect(code).toContain("DOMPurify.sanitize");
  });

  it("should generate complete React Advanced code with all hook types", () => {
    const code = generateCodeSnippet(fullConfig, "react-advanced", {
      hooks: {
        getHeaders: "async () => ({ 'X-Session': sessionStorage.getItem('session') })",
        onFeedback: "(f) => console.log(f)",
        onCopy: "(m) => navigator.clipboard.writeText(m.content)",
        requestMiddleware: "({ payload }) => ({ ...payload, version: '1.0' })",
        actionHandlers: `[(action) => {
          if (action.type === 'redirect') {
            window.location.href = action.payload.url;
            return { handled: true };
          }
        }]`,
        postprocessMessage: "({ text }) => text.replace(/\\n/g, '<br>')",
      },
    });

    // Should contain all hooks
    expect(code).toContain("X-Session");
    expect(code).toContain("console.log(f)");
    expect(code).toContain("navigator.clipboard");
    expect(code).toContain("version: '1.0'");
    expect(code).toContain("action.type === 'redirect'");
    expect(code).toContain(".replace(/\\n/g");
  });
});

// =============================================================================
// Backward Compatibility Tests
// =============================================================================

describe("Suggestions Serialization", () => {
  it("preserves structured suggestion configuration in every format", () => {
    const config = {
      ...minimalConfig,
      suggestions: {
        starters: {
          variant: "card",
          behavior: "fill",
          items: [
            {
              id: "compare",
              label: "Compare plans",
              prompt: "Compare plans for my team",
            },
          ],
        },
        followUps: {
          placement: "after-message",
          overflow: "scroll",
        },
      },
    };
    const formats: CodeFormat[] = [
      "esm",
      "react-component",
      "react-advanced",
      "script-installer",
      "script-manual",
      "script-advanced",
    ];

    for (const format of formats) {
      const code = generateCodeSnippet(config, format);
      expect(code).toContain("suggestions");
      expect(code).toContain("Compare plans");
      expect(code).toContain("after-message");
    }
  });
});

describe("Backward Compatibility", () => {
  it.each<CodeFormat>(["esm", "react-component", "react-advanced", "script-installer", "script-manual", "script-advanced"])("preserves brand and explicit dark overrides in %s", (format) => {
    const code = generateCodeSnippet({
      ...minimalConfig,
      brand: { accent: "#4361ee", neutral: "#18181b", font: "Georgia, serif", radius: "md", density: "compact", elevation: "flat" },
      colorScheme: "auto",
      darkTheme: { semantic: { colors: { text: "#eeeeee" } } },
    }, format);
    for (const value of ["brand", "#4361ee", "#18181b", "Georgia, serif", "compact", "flat", "colorScheme", "auto", "darkTheme", "#eeeeee"]) {
      expect(code).toContain(value);
    }
  });

  it("should work without options parameter", () => {
    const code = generateCodeSnippet(minimalConfig, "esm");

    expect(code).toContain("initAgentWidget");
    expect(code).toContain(minimalConfig.apiUrl);
  });

  it("should work with only format parameter", () => {
    const formats: CodeFormat[] = ["esm", "react-component", "script-manual"];

    for (const format of formats) {
      const code = generateCodeSnippet(minimalConfig, format);
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it("should default to esm format when not specified", () => {
    const code = generateCodeSnippet(minimalConfig);

    expect(code).toContain("import");
    expect(code).toContain("from");
  });
});

// =============================================================================
// CDN Version Tests
// =============================================================================

describe("CDN Version", () => {
  it("should use package version instead of @latest in script-installer format", () => {
    const code = generateCodeSnippet(minimalConfig, "script-installer");

    expect(code).toContain(`@runtypelabs/persona@${VERSION}`);
    expect(code).not.toContain("@latest");
  });

  it("should use package version instead of @latest in script-manual format", () => {
    const code = generateCodeSnippet(minimalConfig, "script-manual");

    expect(code).toContain(`@runtypelabs/persona@${VERSION}/dist/widget.css`);
    expect(code).toContain(`@runtypelabs/persona@${VERSION}/dist/index.global.js`);
    expect(code).not.toContain("@latest");
  });

  it("should use package version instead of @latest in script-advanced format", () => {
    const code = generateCodeSnippet(minimalConfig, "script-advanced");

    expect(code).toContain(`@runtypelabs/persona@${VERSION}/dist`);
    expect(code).not.toContain("@latest");
  });

  it("should have a valid semver version format", () => {
    // Verify VERSION looks like a semver (e.g., "1.36.1")
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// =============================================================================
// windowKey option
// =============================================================================

describe("windowKey option", () => {
  it("script-installer with windowKey nests config and includes windowKey in JSON", () => {
    const code = generateCodeSnippet(minimalConfig, "script-installer", { windowKey: "myWidget" });

    // Parse the data-config JSON from the output
    const match = code.match(/data-config='([^']*)'/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);

    expect(parsed.windowKey).toBe("myWidget");
    expect(parsed.config).toBeDefined();
    expect(parsed.config.apiUrl).toBe(minimalConfig.apiUrl);
  });

  it("script-installer without windowKey uses flat config (no nesting)", () => {
    const code = generateCodeSnippet(minimalConfig, "script-installer");

    const match = code.match(/data-config='([^']*)'/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);

    expect(parsed.windowKey).toBeUndefined();
    expect(parsed.config).toBeUndefined();
    expect(parsed.apiUrl).toBe(minimalConfig.apiUrl);
  });

  it("script-manual with windowKey includes windowKey and captures handle", () => {
    const code = generateCodeSnippet(minimalConfig, "script-manual", { windowKey: "myWidget" });

    expect(code).toContain("var handle = window.AgentWidget.initAgentWidget(");
    expect(code).toContain("windowKey: 'myWidget'");
  });

  it("script-manual without windowKey still captures handle but omits windowKey", () => {
    const code = generateCodeSnippet(minimalConfig, "script-manual");

    expect(code).toContain("var handle = window.AgentWidget.initAgentWidget(");
    expect(code).not.toContain("windowKey");
  });

  it("script-advanced with windowKey includes windowKey in initAgentWidget call", () => {
    const code = generateCodeSnippet(minimalConfig, "script-advanced", { windowKey: "myWidget" });

    expect(code).toContain("windowKey: 'myWidget'");
  });

  it("script-advanced without windowKey omits windowKey", () => {
    const code = generateCodeSnippet(minimalConfig, "script-advanced");

    expect(code).not.toContain("windowKey");
  });
});


// Evaluate the actual emitted object instead of only looking for text matches.
function evaluateConfigObject(source: string, bindings: Record<string, unknown> = {}): AgentWidgetConfig {
  const parsed = ts.createSourceFile("snippet.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (initializer) return;
    if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === "config" && ts.isObjectLiteralExpression(node.initializer)) {
      initializer = node.initializer;
    } else if (ts.isVariableDeclaration(node) && ["CONFIG", "config"].includes(node.name.getText(parsed)) && node.initializer) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (!initializer) throw new Error("Snippet has no configuration object");
  const javascript = ts.transpileModule(`const result = ${initializer.getText(parsed)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const dependencies = {
    loadSavedMessages: () => [],
    defaultJsonActionParser: () => null,
    defaultActionHandlers: [],
    collectDOMContext: () => ({}),
    ...bindings,
  };
  return new Function(...Object.keys(dependencies), `${javascript}\nreturn result;`)(...Object.values(dependencies));
}

function readGeneratedConfig(code: string, format: CodeFormat): AgentWidgetConfig {
  if (format === "script-installer") {
    const attribute = code.match(/data-config='([^']*)'/)?.[1];
    if (!attribute) throw new Error("Missing installer configuration");
    const decoded = attribute
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    return JSON.parse(decoded);
  }
  const javascript = format.startsWith("script-") ? code.match(/<script>([\s\S]*?)<\/script>/)?.[1] : code;
  if (!javascript) throw new Error("Missing inline initialization script");
  return evaluateConfigObject(javascript);
}

const allFormats: CodeFormat[] = [
  "esm", "react-component", "react-advanced", "script-installer", "script-manual", "script-advanced",
];

describe("Welcome and approval export parity", () => {
  const escapedText = `Quotes " and ', backslash \\, newline\n, \u2028, \u2029, </script>, &amp; &#39;`;
  const presentation = {
    copy: { showWelcomeCard: false, welcomeTitle: "", inputPlaceholder: escapedText },
    welcome: {
      title: escapedText,
      subtitle: "",
      icon: { type: "image", url: "https://example.com/logo?a=1&b=2", alt: "", placement: "inline" },
      message: "Hello",
      anchor: "center",
      composerGap: "0px",
    },
    approval: {
      keyboardShortcuts: false,
      enableAlwaysAllow: false,
      reasonLabel: "",
      approveLabel: escapedText,
      detailsDisplay: "hidden",
      shadow: "none",
    },
    suggestions: { starters: { items: [] } },
    theme: { components: { approval: { requested: { background: "transparent" } } } },
  };

  it.each(allFormats)("round-trips welcome, approval, copy, and empty starters in %s", (format) => {
    const snippet = generateCodeSnippet({ ...minimalConfig, ...presentation }, format);
    const exported = readGeneratedConfig(snippet, format);
    expect(exported.copy).toEqual(presentation.copy);
    expect(exported.welcome).toEqual(presentation.welcome);
    expect(exported.approval).toEqual(presentation.approval);
    expect(exported.suggestions).toEqual(presentation.suggestions);
    expect(exported.theme).toEqual(presentation.theme);
    if (format !== "script-installer") {
      expect(snippet).not.toContain("</script>,");
    }
  });

  it.each(allFormats)("preserves scoped approval and question appearance tokens in %s", (format) => {
    const theme = { components: {
      approval: { requested: { titleColor: "red", descriptionColor: "green", reasonColor: "blue", parameters: { background: "transparent", foreground: "purple" } }, approve: { foreground: "yellow" }, deny: { foreground: "orange" } },
      askUserQuestion: { sheet: { background: "pink", border: "red", shadow: "none" }, pill: { background: "white", foreground: "black", borderRadius: "0", selectedBackground: "blue", selectedForeground: "white" }, customInput: { background: "transparent" } },
    } };
    expect(readGeneratedConfig(generateCodeSnippet({ ...minimalConfig, theme }, format), format).theme).toEqual(theme);
  });

  it.each(allFormats)("preserves approval:false and primitive numeric values in %s", (format) => {
    const exported = readGeneratedConfig(generateCodeSnippet({
      ...minimalConfig,
      approval: false,
      copy: { showWelcomeCard: false },
      theme: { components: { composer: { submit: { iconSize: 0 } } } },
    }, format), format);
    expect(exported.approval).toBe(false);
    expect(exported.copy?.showWelcomeCard).toBe(false);
    expect(exported.theme).toEqual({ components: { composer: { submit: { iconSize: 0 } } } });
  });

  it.each(allFormats)("identifies unsupported functions without changing serializable siblings in %s", (format) => {
    const icon = () => document.createElement("div");
    const formatDescription = () => "Custom summary";
    const onDecision = async () => undefined;
    const input = { ...minimalConfig, welcome: { title: "Hello", icon }, approval: { title: "Permission", formatDescription, onDecision } };
    const snippet = generateCodeSnippet(input, format);
    expect(snippet).toContain("Function-valued welcome.icon, approval.formatDescription, approval.onDecision omitted; reattach in host JavaScript.");
    const exported = readGeneratedConfig(snippet, format);
    expect(exported.welcome).toEqual({ title: "Hello" });
    expect(exported.approval).toEqual({ title: "Permission" });
    expect(input.welcome.icon).toBe(icon);
    expect(input.approval.onDecision).toBe(onDecision);
  });

  it.each(allFormats)("preserves text and Lucide icon objects in %s", (format) => {
    for (const icon of [{ type: "text", text: "👋" }, { type: "lucide", name: "sparkles", placement: "inline" }]) {
      const exported = readGeneratedConfig(generateCodeSnippet({ ...minimalConfig, welcome: { icon } }, format), format);
      expect(exported.welcome?.icon).toEqual(icon);
    }
  });
});

describe("Client-token demo presentation", () => {
  it("uses semantic colors that reach CSS and preserves welcome/starter content", () => {
    const source = readFileSync(new URL("../../../../apps/web/src/client-token-demo.ts", import.meta.url), "utf8");
    const config = evaluateConfigObject(source, {
      DEFAULT_WIDGET_CONFIG,
      clientToken: "ct_test",
      createLocalStorageAdapter: () => ({}),
    });
    const css = themeToCssVariables(createTheme(config.theme));
    expect(css).toMatchObject({
      "--persona-primary": "#090E34",
      "--persona-accent": "#3056D3",
      "--persona-surface": "#ffffff",
      "--persona-text-muted": "#637381",
      "--persona-container": "#f3f4f6",
      "--persona-border": "#e7e7e7",
    });
    expect(config.welcome).toEqual({ title: "Welcome! 👋", subtitle: "Connected via client token. Ask me anything!" });
    expect(config.suggestions?.starters?.items).toEqual(["Hello!", "What can you help with?", "Tell me a joke"]);
    expect(source).not.toContain("config as any");
  });
});
