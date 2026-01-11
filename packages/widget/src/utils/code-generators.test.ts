import { describe, it, expect } from "vitest";
import { generateCodeSnippet, type CodeFormat, type CodeGeneratorHooks, type CodeGeneratorOptions } from "./code-generators";

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
    primaryColor: "#007bff",
    fontFamily: "Inter, sans-serif",
  },
  messageActions: {
    enableCopy: true,
    enableFeedback: true,
    feedbackType: "thumbs",
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
          (action: any, ctx: any) => {
            if (action.type === 'custom') {
              return { handled: true };
            }
          },
          (action: any, ctx: any) => {
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

describe("Backward Compatibility", () => {
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
