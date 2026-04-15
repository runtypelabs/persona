import type { AgentWidgetConfig } from "../types";
import { VERSION } from "../version";

type ParserType = "plain" | "json" | "regex-json" | "xml";
export type CodeFormat = "esm" | "script-installer" | "script-manual" | "script-advanced" | "react-component" | "react-advanced";

/**
 * Hook code templates for code generation.
 * Each hook can be provided as a string (code template) OR as an actual function.
 * Functions are automatically serialized via `.toString()`.
 *
 * IMPORTANT: When providing functions:
 * - Functions must be self-contained (no external variables/closures)
 * - External variables will be undefined when the generated code runs
 * - Use arrow functions or regular function expressions
 *
 * @example
 * ```typescript
 * // Both of these work:
 *
 * // As string:
 * { getHeaders: "async () => ({ 'Authorization': 'Bearer token' })" }
 *
 * // As function (recommended - better IDE support):
 * { getHeaders: async () => ({ 'Authorization': 'Bearer token' }) }
 * ```
 */
export type CodeGeneratorHooks = {
  /**
   * Custom getHeaders function.
   * Should return an object with header key-value pairs.
   *
   * @example
   * ```typescript
   * async () => ({ 'Authorization': `Bearer ${await getAuthToken()}` })
   * ```
   */
  getHeaders?: string | (() => Record<string, string> | Promise<Record<string, string>>);

  /**
   * Custom onFeedback callback for message actions.
   * Receives a feedback object with type, messageId, and message.
   *
   * @example
   * ```typescript
   * (feedback) => { console.log('Feedback:', feedback.type); }
   * ```
   */
  onFeedback?: string | ((feedback: { type: string; messageId: string; message: unknown }) => void);

  /**
   * Custom onCopy callback for message actions.
   * Receives the message that was copied.
   *
   * @example
   * ```typescript
   * (message) => { analytics.track('message_copied', { id: message.id }); }
   * ```
   */
  onCopy?: string | ((message: unknown) => void);

  /**
   * Custom requestMiddleware function.
   * Receives { payload, config } context.
   *
   * @example
   * ```typescript
   * ({ payload }) => ({ ...payload, metadata: { pageUrl: window.location.href } })
   * ```
   */
  requestMiddleware?: string | ((context: { payload: unknown; config: unknown }) => unknown);

  /**
   * Custom action handlers array.
   * Array of handler functions.
   *
   * @example
   * ```typescript
   * [
   *   (action, context) => {
   *     if (action.type === 'custom') {
   *       return { handled: true };
   *     }
   *   }
   * ]
   * ```
   */
  actionHandlers?: string | Array<(action: unknown, context: unknown) => unknown>;

  /**
   * Custom action parsers array.
   * Array of parser functions.
   */
  actionParsers?: string | Array<(context: unknown) => unknown>;

  /**
   * Custom postprocessMessage function.
   * Receives { text, message, streaming, raw } context.
   * Will override the default markdownPostprocessor.
   *
   * @example
   * ```typescript
   * ({ text }) => customMarkdownProcessor(text)
   * ```
   */
  postprocessMessage?: string | ((context: { text: string; message?: unknown; streaming?: boolean; raw?: string }) => string);

  /**
   * Custom context providers array.
   * Array of provider functions.
   */
  contextProviders?: string | Array<() => unknown>;

  /**
   * Custom stream parser factory.
   * Should be a function that returns a StreamParser.
   */
  streamParser?: string | (() => unknown);
};

/**
 * Options for code generation beyond format selection.
 */
export type CodeGeneratorOptions = {
  /**
   * Custom hook code to inject into the generated snippet.
   * Hooks are JavaScript/TypeScript code strings that will be
   * inserted at appropriate locations in the output.
   */
  hooks?: CodeGeneratorHooks;

  /**
   * Whether to include comments explaining each hook.
   * @default true
   */
  includeHookComments?: boolean;

  /**
   * If provided, emits `windowKey` in the generated `initAgentWidget()` call
   * so the widget handle is stored on `window[windowKey]`.
   * Only affects script formats (script-installer, script-manual, script-advanced).
   */
  windowKey?: string;
};

// Internal type for normalized hooks (always strings)
type NormalizedHooks = {
  [K in keyof CodeGeneratorHooks]: string | undefined;
};

/**
 * Serialize a hook value (string, function, or array of functions) to a string.
 */
function serializeHook(hook: string | Function | Function[] | undefined): string | undefined {
  if (hook === undefined) return undefined;
  if (typeof hook === 'string') return hook;
  if (Array.isArray(hook)) {
    return `[${hook.map(fn => fn.toString()).join(', ')}]`;
  }
  return hook.toString();
}

/**
 * Normalize hooks by converting any functions to their string representations.
 */
function normalizeHooks(hooks: CodeGeneratorHooks | undefined): NormalizedHooks | undefined {
  if (!hooks) return undefined;

  return {
    getHeaders: serializeHook(hooks.getHeaders),
    onFeedback: serializeHook(hooks.onFeedback),
    onCopy: serializeHook(hooks.onCopy),
    requestMiddleware: serializeHook(hooks.requestMiddleware),
    actionHandlers: serializeHook(hooks.actionHandlers),
    actionParsers: serializeHook(hooks.actionParsers),
    postprocessMessage: serializeHook(hooks.postprocessMessage),
    contextProviders: serializeHook(hooks.contextProviders),
    streamParser: serializeHook(hooks.streamParser),
  };
}

// =============================================================================
// Template Literals for Code Generation
// These are injected into generated code as-is.
// =============================================================================

/**
 * Template: Parser for JSON wrapped in markdown code fences (TypeScript).
 * @internal
 */
const TEMPLATE_MARKDOWN_JSON_PARSER_TS = `({ text, message }: any) => {
  const jsonSource = (message as any).rawContent || text || message.content;
  if (!jsonSource || typeof jsonSource !== 'string') return null;
  let cleanJson = jsonSource
    .replace(/^\`\`\`(?:json)?\\s*\\n?/, '')
    .replace(/\\n?\`\`\`\\s*$/, '')
    .trim();
  if (!cleanJson.startsWith('{') || !cleanJson.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(cleanJson);
    if (parsed.action) return { type: parsed.action, payload: parsed };
  } catch (e) { return null; }
  return null;
}`;

/**
 * Template: Parser for JSON wrapped in markdown code fences (ES5).
 * @internal
 */
const TEMPLATE_MARKDOWN_JSON_PARSER_ES5 = `function(ctx) {
  var jsonSource = ctx.message.rawContent || ctx.text || ctx.message.content;
  if (!jsonSource || typeof jsonSource !== 'string') return null;
  var cleanJson = jsonSource
    .replace(/^\`\`\`(?:json)?\\s*\\n?/, '')
    .replace(/\\n?\`\`\`\\s*$/, '')
    .trim();
  if (!cleanJson.startsWith('{') || !cleanJson.endsWith('}')) return null;
  try {
    var parsed = JSON.parse(cleanJson);
    if (parsed.action) return { type: parsed.action, payload: parsed };
  } catch (e) { return null; }
  return null;
}`;

/**
 * Template: Handler for nav_then_click actions (TypeScript).
 * @internal
 */
const TEMPLATE_NAV_THEN_CLICK_HANDLER_TS = `(action: any, context: any) => {
  if (action.type !== 'nav_then_click') return;
  const payload = action.payload || action.raw || {};
  const url = payload?.page;
  const text = payload?.on_load_text || 'Navigating...';
  if (!url) return { handled: true, displayText: text };
  const messageId = context.message?.id;
  const processedActions = JSON.parse(localStorage.getItem(PROCESSED_ACTIONS_KEY) || '[]');
  const actionKey = \`nav_\${messageId}_\${url}\`;
  if (processedActions.includes(actionKey)) {
    return { handled: true, displayText: text };
  }
  processedActions.push(actionKey);
  localStorage.setItem(PROCESSED_ACTIONS_KEY, JSON.stringify(processedActions));
  const targetUrl = url.startsWith('http') ? url : new URL(url, window.location.origin).toString();
  window.location.href = targetUrl;
  return { handled: true, displayText: text };
}`;

/**
 * Template: Handler for nav_then_click actions (ES5).
 * @internal
 */
const TEMPLATE_NAV_THEN_CLICK_HANDLER_ES5 = `function(action, context) {
  if (action.type !== 'nav_then_click') return;
  var payload = action.payload || action.raw || {};
  var url = payload.page;
  var text = payload.on_load_text || 'Navigating...';
  if (!url) return { handled: true, displayText: text };
  var messageId = context.message ? context.message.id : null;
  var processedActions = JSON.parse(localStorage.getItem(PROCESSED_ACTIONS_KEY) || '[]');
  var actionKey = 'nav_' + messageId + '_' + url;
  if (processedActions.includes(actionKey)) {
    return { handled: true, displayText: text };
  }
  processedActions.push(actionKey);
  localStorage.setItem(PROCESSED_ACTIONS_KEY, JSON.stringify(processedActions));
  var targetUrl = url.startsWith('http') ? url : new URL(url, window.location.origin).toString();
  window.location.href = targetUrl;
  return { handled: true, displayText: text };
}`;

/**
 * Template: Stream parser callback (TypeScript).
 * @internal
 */
const TEMPLATE_STREAM_PARSER_CALLBACK_TS = `(parsed: any) => {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.action === 'nav_then_click') return 'Navigating...';
  if (parsed.action === 'message') return parsed.text || '';
  if (parsed.action === 'message_and_click') return parsed.text || 'Processing...';
  return parsed.text || null;
}`;

/**
 * Template: Stream parser callback (ES5).
 * @internal
 */
const TEMPLATE_STREAM_PARSER_CALLBACK_ES5 = `function(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.action === 'nav_then_click') return 'Navigating...';
  if (parsed.action === 'message') return parsed.text || '';
  if (parsed.action === 'message_and_click') return parsed.text || 'Processing...';
  return parsed.text || null;
}`;

function detectParserTypeFromStreamParser(streamParser: any): ParserType | null {
  if (!streamParser) return null;
  const fnString = streamParser.toString();
  if (fnString.includes("createJsonStreamParser") || fnString.includes("partial-json")) {
    return "json";
  }
  if (fnString.includes("createRegexJsonParser") || fnString.includes("regex")) {
    return "regex-json";
  }
  if (fnString.includes("createXmlParser") || fnString.includes("<text>")) {
    return "xml";
  }
  return null;
}

function getParserTypeFromConfig(config: AgentWidgetConfig): ParserType {
  return config.parserType ?? detectParserTypeFromStreamParser(config.streamParser) ?? "plain";
}

// Helper to generate toolCall config
function generateToolCallConfig(config: any, indent: string): string[] {
  const lines: string[] = [];
  if (config.toolCall) {
    lines.push(`${indent}toolCall: {`);
    Object.entries(config.toolCall).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`${indent}  ${key}: "${value}",`);
      }
    });
    lines.push(`${indent}},`);
  }
  return lines;
}

// Helper to generate messageActions config (with optional hook callbacks)
function generateMessageActionsConfig(config: any, indent: string, hooks?: CodeGeneratorHooks): string[] {
  const lines: string[] = [];
  const hasSerializableProps = config.messageActions && Object.entries(config.messageActions).some(
    ([key, value]) => key !== "onFeedback" && key !== "onCopy" && value !== undefined
  );
  const hasHookCallbacks = hooks?.onFeedback || hooks?.onCopy;

  if (hasSerializableProps || hasHookCallbacks) {
    lines.push(`${indent}messageActions: {`);

    // Add serializable properties from config
    if (config.messageActions) {
      Object.entries(config.messageActions).forEach(([key, value]) => {
        // Skip function callbacks - we'll add from hooks if provided
        if (key === "onFeedback" || key === "onCopy") return;
        if (typeof value === "string") {
          lines.push(`${indent}  ${key}: "${value}",`);
        } else if (typeof value === "boolean") {
          lines.push(`${indent}  ${key}: ${value},`);
        }
      });
    }

    // Add hook callbacks
    if (hooks?.onFeedback) {
      lines.push(`${indent}  onFeedback: ${hooks.onFeedback},`);
    }
    if (hooks?.onCopy) {
      lines.push(`${indent}  onCopy: ${hooks.onCopy},`);
    }

    lines.push(`${indent}},`);
  }
  return lines;
}

// Helper to generate markdown config (excluding renderer functions)
function generateMarkdownConfig(config: any, indent: string): string[] {
  const lines: string[] = [];
  if (config.markdown) {
    const hasOptions = config.markdown.options && Object.keys(config.markdown.options).length > 0;
    const hasDisableDefaultStyles = config.markdown.disableDefaultStyles !== undefined;
    
    if (hasOptions || hasDisableDefaultStyles) {
      lines.push(`${indent}markdown: {`);
      
      if (hasOptions) {
        lines.push(`${indent}  options: {`);
        Object.entries(config.markdown.options).forEach(([key, value]) => {
          if (typeof value === "string") {
            lines.push(`${indent}    ${key}: "${value}",`);
          } else if (typeof value === "boolean") {
            lines.push(`${indent}    ${key}: ${value},`);
          }
        });
        lines.push(`${indent}  },`);
      }
      
      if (hasDisableDefaultStyles) {
        lines.push(`${indent}  disableDefaultStyles: ${config.markdown.disableDefaultStyles},`);
      }
      
      lines.push(`${indent}},`);
    }
  }
  return lines;
}

// Helper to generate layout config (excluding render functions and slots)
function generateLayoutConfig(config: any, indent: string): string[] {
  const lines: string[] = [];
  if (config.layout) {
    const hasHeader = config.layout.header && Object.keys(config.layout.header).some(
      (key: string) => key !== "render"
    );
    const hasMessages = config.layout.messages && Object.keys(config.layout.messages).some(
      (key: string) => key !== "renderUserMessage" && key !== "renderAssistantMessage"
    );
    
    if (hasHeader || hasMessages) {
      lines.push(`${indent}layout: {`);
      
      // Header config (excluding render function)
      if (hasHeader) {
        lines.push(`${indent}  header: {`);
        Object.entries(config.layout.header).forEach(([key, value]) => {
          if (key === "render") return; // Skip render function
          if (typeof value === "string") {
            lines.push(`${indent}    ${key}: "${value}",`);
          } else if (typeof value === "boolean") {
            lines.push(`${indent}    ${key}: ${value},`);
          }
        });
        lines.push(`${indent}  },`);
      }
      
      // Messages config (excluding render functions)
      if (hasMessages) {
        lines.push(`${indent}  messages: {`);
        Object.entries(config.layout.messages).forEach(([key, value]) => {
          // Skip render functions
          if (key === "renderUserMessage" || key === "renderAssistantMessage") return;
          
          if (key === "avatar" && typeof value === "object" && value !== null) {
            lines.push(`${indent}    avatar: {`);
            Object.entries(value as Record<string, unknown>).forEach(([avatarKey, avatarValue]) => {
              if (typeof avatarValue === "string") {
                lines.push(`${indent}      ${avatarKey}: "${avatarValue}",`);
              } else if (typeof avatarValue === "boolean") {
                lines.push(`${indent}      ${avatarKey}: ${avatarValue},`);
              }
            });
            lines.push(`${indent}    },`);
          } else if (key === "timestamp" && typeof value === "object" && value !== null) {
            // Only emit serializable timestamp properties (skip format function)
            const hasSerializableTimestamp = Object.entries(value as Record<string, unknown>).some(
              ([k]) => k !== "format"
            );
            if (hasSerializableTimestamp) {
              lines.push(`${indent}    timestamp: {`);
              Object.entries(value as Record<string, unknown>).forEach(([tsKey, tsValue]) => {
                if (tsKey === "format") return; // Skip format function
                if (typeof tsValue === "string") {
                  lines.push(`${indent}      ${tsKey}: "${tsValue}",`);
                } else if (typeof tsValue === "boolean") {
                  lines.push(`${indent}      ${tsKey}: ${tsValue},`);
                }
              });
              lines.push(`${indent}    },`);
            }
          } else if (typeof value === "string") {
            lines.push(`${indent}    ${key}: "${value}",`);
          } else if (typeof value === "boolean") {
            lines.push(`${indent}    ${key}: ${value},`);
          }
        });
        lines.push(`${indent}  },`);
      }
      
      lines.push(`${indent}},`);
    }
  }
  return lines;
}

// Helper to generate hook-related config lines
function generateHooksConfig(hooks: CodeGeneratorHooks | undefined, indent: string): string[] {
  const lines: string[] = [];
  if (!hooks) return lines;

  if (hooks.getHeaders) {
    lines.push(`${indent}getHeaders: ${hooks.getHeaders},`);
  }

  if (hooks.requestMiddleware) {
    lines.push(`${indent}requestMiddleware: ${hooks.requestMiddleware},`);
  }

  if (hooks.actionParsers) {
    lines.push(`${indent}actionParsers: ${hooks.actionParsers},`);
  }

  if (hooks.actionHandlers) {
    lines.push(`${indent}actionHandlers: ${hooks.actionHandlers},`);
  }

  if (hooks.contextProviders) {
    lines.push(`${indent}contextProviders: ${hooks.contextProviders},`);
  }

  if (hooks.streamParser) {
    lines.push(`${indent}streamParser: ${hooks.streamParser},`);
  }

  return lines;
}

function appendSerializableObjectEntries(
  lines: string[],
  value: Record<string, unknown>,
  indent: string
): void {
  Object.entries(value).forEach(([key, entryValue]) => {
    if (entryValue === undefined || typeof entryValue === "function") return;

    if (Array.isArray(entryValue)) {
      lines.push(`${indent}${key}: ${JSON.stringify(entryValue)},`);
      return;
    }

    if (entryValue && typeof entryValue === "object") {
      lines.push(`${indent}${key}: {`);
      appendSerializableObjectEntries(lines, entryValue as Record<string, unknown>, `${indent}  `);
      lines.push(`${indent}},`);
      return;
    }

    lines.push(`${indent}${key}: ${JSON.stringify(entryValue)},`);
  });
}

function appendSerializableObjectBlock(
  lines: string[],
  key: string,
  value: Record<string, unknown> | undefined,
  indent: string
): void {
  if (!value) return;
  lines.push(`${indent}${key}: {`);
  appendSerializableObjectEntries(lines, value, `${indent}  `);
  lines.push(`${indent}},`);
}

export function generateCodeSnippet(
  config: any,
  format: CodeFormat = "esm",
  options?: CodeGeneratorOptions
): string {
  // Remove non-serializable properties
  const cleanConfig = { ...config };
  delete cleanConfig.postprocessMessage;
  delete cleanConfig.initialMessages;

  // Normalize hooks - convert functions to strings via .toString()
  const normalizedOptions: CodeGeneratorOptions | undefined = options
    ? { ...options, hooks: normalizeHooks(options.hooks) as CodeGeneratorHooks }
    : undefined;

  if (format === "esm") {
    return generateESMCode(cleanConfig, normalizedOptions);
  } else if (format === "script-installer") {
    return generateScriptInstallerCode(cleanConfig, normalizedOptions);
  } else if (format === "script-advanced") {
    return generateScriptAdvancedCode(cleanConfig, normalizedOptions);
  } else if (format === "react-component") {
    return generateReactComponentCode(cleanConfig, normalizedOptions);
  } else if (format === "react-advanced") {
    return generateReactAdvancedCode(cleanConfig, normalizedOptions);
  } else {
    return generateScriptManualCode(cleanConfig, normalizedOptions);
  }
}

function generateESMCode(config: any, options?: CodeGeneratorOptions): string {
  const hooks = options?.hooks;
  const parserType = getParserTypeFromConfig(config as AgentWidgetConfig);
  const shouldEmitParserType = parserType !== "plain";

  const lines: string[] = [
    "import '@runtypelabs/persona/widget.css';",
    "import { initAgentWidget, markdownPostprocessor } from '@runtypelabs/persona';",
    "",
    "initAgentWidget({",
    "  target: 'body',",
    "  config: {"
  ];

  if (config.apiUrl) lines.push(`    apiUrl: "${config.apiUrl}",`);
  if (config.clientToken) lines.push(`    clientToken: "${config.clientToken}",`);
  if (config.flowId) lines.push(`    flowId: "${config.flowId}",`);
  if (shouldEmitParserType) lines.push(`    parserType: "${parserType}",`);

  if (config.theme && typeof config.theme === "object" && Object.keys(config.theme).length > 0) {
    appendSerializableObjectBlock(lines, "theme", config.theme as Record<string, unknown>, "    ");
  }

  if (config.launcher) {
    appendSerializableObjectBlock(lines, "launcher", config.launcher, "    ");
  }

  if (config.copy) {
    lines.push("    copy: {");
    Object.entries(config.copy).forEach(([key, value]) => {
      lines.push(`      ${key}: "${value}",`);
    });
    lines.push("    },");
  }

  if (config.sendButton) {
    lines.push("    sendButton: {");
    Object.entries(config.sendButton).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`      ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`      ${key}: ${value},`);
      }
    });
    lines.push("    },");
  }

  if (config.voiceRecognition) {
    lines.push("    voiceRecognition: {");
    Object.entries(config.voiceRecognition).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`      ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`      ${key}: ${value},`);
      } else if (typeof value === "number") {
        lines.push(`      ${key}: ${value},`);
      }
    });
    lines.push("    },");
  }

  if (config.statusIndicator) {
    lines.push("    statusIndicator: {");
    Object.entries(config.statusIndicator).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`      ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`      ${key}: ${value},`);
      }
    });
    lines.push("    },");
  }

  if (config.features) {
    lines.push("    features: {");
    Object.entries(config.features).forEach(([key, value]) => {
      lines.push(`      ${key}: ${value},`);
    });
    lines.push("    },");
  }

  if (config.suggestionChips && config.suggestionChips.length > 0) {
    lines.push("    suggestionChips: [");
    config.suggestionChips.forEach((chip: string) => {
      lines.push(`      "${chip}",`);
    });
    lines.push("    ],");
  }

  if (config.suggestionChipsConfig) {
    lines.push("    suggestionChipsConfig: {");
    if (config.suggestionChipsConfig.fontFamily) {
      lines.push(`      fontFamily: "${config.suggestionChipsConfig.fontFamily}",`);
    }
    if (config.suggestionChipsConfig.fontWeight) {
      lines.push(`      fontWeight: "${config.suggestionChipsConfig.fontWeight}",`);
    }
    if (config.suggestionChipsConfig.paddingX) {
      lines.push(`      paddingX: "${config.suggestionChipsConfig.paddingX}",`);
    }
    if (config.suggestionChipsConfig.paddingY) {
      lines.push(`      paddingY: "${config.suggestionChipsConfig.paddingY}",`);
    }
    lines.push("    },");
  }

  // Add toolCall config
  lines.push(...generateToolCallConfig(config, "    "));

  // Add messageActions config (with hook callbacks if provided)
  lines.push(...generateMessageActionsConfig(config, "    ", hooks));

  // Add markdown config
  lines.push(...generateMarkdownConfig(config, "    "));

  // Add layout config
  lines.push(...generateLayoutConfig(config, "    "));

  // Add hook-based config (getHeaders, requestMiddleware, actionParsers, actionHandlers, etc.)
  lines.push(...generateHooksConfig(hooks, "    "));

  if (config.debug) {
    lines.push(`    debug: ${config.debug},`);
  }

  // Use custom postprocessMessage if provided, otherwise default
  if (hooks?.postprocessMessage) {
    lines.push(`    postprocessMessage: ${hooks.postprocessMessage}`);
  } else {
    lines.push("    postprocessMessage: ({ text }) => markdownPostprocessor(text)");
  }
  lines.push("  }");
  lines.push("});");

  return lines.join("\n");
}

function generateReactComponentCode(config: any, options?: CodeGeneratorOptions): string {
  const hooks = options?.hooks;
  const parserType = getParserTypeFromConfig(config as AgentWidgetConfig);
  const shouldEmitParserType = parserType !== "plain";

  const lines: string[] = [
    "// ChatWidget.tsx",
    "'use client'; // Required for Next.js - remove for Vite/CRA",
    "",
    "import { useEffect } from 'react';",
    "import '@runtypelabs/persona/widget.css';",
    "import { initAgentWidget, markdownPostprocessor } from '@runtypelabs/persona';",
    "import type { AgentWidgetInitHandle } from '@runtypelabs/persona';",
    "",
    "export function ChatWidget() {",
    "  useEffect(() => {",
    "    let handle: AgentWidgetInitHandle | null = null;",
    "",
    "    handle = initAgentWidget({",
    "      target: 'body',",
    "      config: {"
  ];

  if (config.apiUrl) lines.push(`        apiUrl: "${config.apiUrl}",`);
  if (config.clientToken) lines.push(`        clientToken: "${config.clientToken}",`);
  if (config.flowId) lines.push(`        flowId: "${config.flowId}",`);
  if (shouldEmitParserType) lines.push(`        parserType: "${parserType}",`);

  if (config.theme && typeof config.theme === "object" && Object.keys(config.theme).length > 0) {
    appendSerializableObjectBlock(lines, "theme", config.theme as Record<string, unknown>, "        ");
  }

  if (config.launcher) {
    appendSerializableObjectBlock(lines, "launcher", config.launcher, "        ");
  }

  if (config.copy) {
    lines.push("        copy: {");
    Object.entries(config.copy).forEach(([key, value]) => {
      lines.push(`          ${key}: "${value}",`);
    });
    lines.push("        },");
  }

  if (config.sendButton) {
    lines.push("        sendButton: {");
    Object.entries(config.sendButton).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`          ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`          ${key}: ${value},`);
      }
    });
    lines.push("        },");
  }

  if (config.voiceRecognition) {
    lines.push("        voiceRecognition: {");
    Object.entries(config.voiceRecognition).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`          ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`          ${key}: ${value},`);
      } else if (typeof value === "number") {
        lines.push(`          ${key}: ${value},`);
      }
    });
    lines.push("        },");
  }

  if (config.statusIndicator) {
    lines.push("        statusIndicator: {");
    Object.entries(config.statusIndicator).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`          ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`          ${key}: ${value},`);
      }
    });
    lines.push("        },");
  }

  if (config.features) {
    lines.push("        features: {");
    Object.entries(config.features).forEach(([key, value]) => {
      lines.push(`          ${key}: ${value},`);
    });
    lines.push("        },");
  }

  if (config.suggestionChips && config.suggestionChips.length > 0) {
    lines.push("        suggestionChips: [");
    config.suggestionChips.forEach((chip: string) => {
      lines.push(`          "${chip}",`);
    });
    lines.push("        ],");
  }

  if (config.suggestionChipsConfig) {
    lines.push("        suggestionChipsConfig: {");
    if (config.suggestionChipsConfig.fontFamily) {
      lines.push(`          fontFamily: "${config.suggestionChipsConfig.fontFamily}",`);
    }
    if (config.suggestionChipsConfig.fontWeight) {
      lines.push(`          fontWeight: "${config.suggestionChipsConfig.fontWeight}",`);
    }
    if (config.suggestionChipsConfig.paddingX) {
      lines.push(`          paddingX: "${config.suggestionChipsConfig.paddingX}",`);
    }
    if (config.suggestionChipsConfig.paddingY) {
      lines.push(`          paddingY: "${config.suggestionChipsConfig.paddingY}",`);
    }
    lines.push("        },");
  }

  // Add toolCall config
  lines.push(...generateToolCallConfig(config, "        "));

  // Add messageActions config (with hook callbacks if provided)
  lines.push(...generateMessageActionsConfig(config, "        ", hooks));

  // Add markdown config
  lines.push(...generateMarkdownConfig(config, "        "));

  // Add layout config
  lines.push(...generateLayoutConfig(config, "        "));

  // Add hook-based config (getHeaders, requestMiddleware, actionParsers, actionHandlers, etc.)
  lines.push(...generateHooksConfig(hooks, "        "));

  if (config.debug) {
    lines.push(`        debug: ${config.debug},`);
  }

  // Use custom postprocessMessage if provided, otherwise default
  if (hooks?.postprocessMessage) {
    lines.push(`        postprocessMessage: ${hooks.postprocessMessage}`);
  } else {
    lines.push("        postprocessMessage: ({ text }) => markdownPostprocessor(text)");
  }
  lines.push("      }");
  lines.push("    });");
  lines.push("");
  lines.push("    // Cleanup on unmount");
  lines.push("    return () => {");
  lines.push("      if (handle) {");
  lines.push("        handle.destroy();");
  lines.push("      }");
  lines.push("    };");
  lines.push("  }, []);");
  lines.push("");
  lines.push("  return null; // Widget injects itself into the DOM");
  lines.push("}");
  lines.push("");
  lines.push("// Usage in your app:");
  lines.push("// import { ChatWidget } from './components/ChatWidget';");
  lines.push("//");
  lines.push("// export default function App() {");
  lines.push("//   return (");
  lines.push("//     <div>");
  lines.push("//       {/* Your app content */}");
  lines.push("//       <ChatWidget />");
  lines.push("//     </div>");
  lines.push("//   );");
  lines.push("// }");

  return lines.join("\n");
}

function generateReactAdvancedCode(config: any, options?: CodeGeneratorOptions): string {
  const hooks = options?.hooks;
  const lines: string[] = [
    "// ChatWidgetAdvanced.tsx",
    "'use client'; // Required for Next.js - remove for Vite/CRA",
    "",
    "import { useEffect } from 'react';",
    "import '@runtypelabs/persona/widget.css';",
    "import {",
    "  initAgentWidget,",
    "  createFlexibleJsonStreamParser,",
    "  defaultJsonActionParser,",
    "  defaultActionHandlers,",
    "  markdownPostprocessor",
    "} from '@runtypelabs/persona';",
    "import type { AgentWidgetInitHandle } from '@runtypelabs/persona';",
    "",
    "const STORAGE_KEY = 'chat-widget-state';",
    "const PROCESSED_ACTIONS_KEY = 'chat-widget-processed-actions';",
    "",
    "// Types for DOM elements",
    "interface PageElement {",
    "  type: string;",
    "  tagName: string;",
    "  selector: string;",
    "  innerText: string;",
    "  href?: string;",
    "}",
    "",
    "interface DOMContext {",
    "  page_elements: PageElement[];",
    "  page_element_count: number;",
    "  element_types: Record<string, number>;",
    "  page_url: string;",
    "  page_title: string;",
    "  timestamp: string;",
    "}",
    "",
    "// DOM context provider - extracts page elements for AI context",
    "const collectDOMContext = (): DOMContext => {",
    "  const selectors = {",
    "    products: '[data-product-id], .product-card, .product-item, [role=\"article\"]',",
    "    buttons: 'button, [role=\"button\"], .btn',",
    "    links: 'a[href]',",
    "    inputs: 'input, textarea, select'",
    "  };",
    "",
    "  const elements: PageElement[] = [];",
    "  Object.entries(selectors).forEach(([type, selector]) => {",
    "    document.querySelectorAll(selector).forEach((element) => {",
    "      if (!(element instanceof HTMLElement)) return;",
    "      ",
    "      // Exclude elements within the widget",
    "      const widgetHost = element.closest('.persona-host');",
    "      if (widgetHost) return;",
    "      ",
    "      const text = element.innerText?.trim();",
    "      if (!text) return;",
    "",
    "      const selectorString =",
    "        element.id ? `#${element.id}` :",
    "        element.getAttribute('data-testid') ? `[data-testid=\"${element.getAttribute('data-testid')}\"]` :",
    "        element.getAttribute('data-product-id') ? `[data-product-id=\"${element.getAttribute('data-product-id')}\"]` :",
    "        element.tagName.toLowerCase();",
    "",
    "      const elementData: PageElement = {",
    "        type,",
    "        tagName: element.tagName.toLowerCase(),",
    "        selector: selectorString,",
    "        innerText: text.substring(0, 200)",
    "      };",
    "",
    "      if (type === 'links' && element instanceof HTMLAnchorElement && element.href) {",
    "        elementData.href = element.href;",
    "      }",
    "",
    "      elements.push(elementData);",
    "    });",
    "  });",
    "",
    "  const counts = elements.reduce((acc, el) => {",
    "    acc[el.type] = (acc[el.type] || 0) + 1;",
    "    return acc;",
    "  }, {} as Record<string, number>);",
    "",
    "  return {",
    "    page_elements: elements.slice(0, 50),",
    "    page_element_count: elements.length,",
    "    element_types: counts,",
    "    page_url: window.location.href,",
    "    page_title: document.title,",
    "    timestamp: new Date().toISOString()",
    "  };",
    "};",
    "",
    "export function ChatWidgetAdvanced() {",
    "  useEffect(() => {",
    "    let handle: AgentWidgetInitHandle | null = null;",
    "",
    "    // Load saved state",
    "    const loadSavedMessages = () => {",
    "      const savedState = localStorage.getItem(STORAGE_KEY);",
    "      if (savedState) {",
    "        try {",
    "          const { messages } = JSON.parse(savedState);",
    "          return messages || [];",
    "        } catch (e) {",
    "          console.error('Failed to load saved state:', e);",
    "        }",
    "      }",
    "      return [];",
    "    };",
    "",
    "    handle = initAgentWidget({",
    "      target: 'body',",
    "      config: {"
  ];

  if (config.apiUrl) lines.push(`        apiUrl: "${config.apiUrl}",`);
  if (config.clientToken) lines.push(`        clientToken: "${config.clientToken}",`);
  if (config.flowId) lines.push(`        flowId: "${config.flowId}",`);

  if (config.theme && typeof config.theme === "object" && Object.keys(config.theme).length > 0) {
    appendSerializableObjectBlock(lines, "theme", config.theme as Record<string, unknown>, "        ");
  }

  if (config.launcher) {
    appendSerializableObjectBlock(lines, "launcher", config.launcher, "        ");
  }

  if (config.copy) {
    lines.push("        copy: {");
    Object.entries(config.copy).forEach(([key, value]) => {
      lines.push(`          ${key}: "${value}",`);
    });
    lines.push("        },");
  }

  if (config.sendButton) {
    lines.push("        sendButton: {");
    Object.entries(config.sendButton).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`          ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`          ${key}: ${value},`);
      }
    });
    lines.push("        },");
  }

  if (config.voiceRecognition) {
    lines.push("        voiceRecognition: {");
    Object.entries(config.voiceRecognition).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`          ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`          ${key}: ${value},`);
      } else if (typeof value === "number") {
        lines.push(`          ${key}: ${value},`);
      }
    });
    lines.push("        },");
  }

  if (config.statusIndicator) {
    lines.push("        statusIndicator: {");
    Object.entries(config.statusIndicator).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`          ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`          ${key}: ${value},`);
      }
    });
    lines.push("        },");
  }

  if (config.features) {
    lines.push("        features: {");
    Object.entries(config.features).forEach(([key, value]) => {
      lines.push(`          ${key}: ${value},`);
    });
    lines.push("        },");
  }

  if (config.suggestionChips && config.suggestionChips.length > 0) {
    lines.push("        suggestionChips: [");
    config.suggestionChips.forEach((chip: string) => {
      lines.push(`          "${chip}",`);
    });
    lines.push("        ],");
  }

  if (config.suggestionChipsConfig) {
    lines.push("        suggestionChipsConfig: {");
    if (config.suggestionChipsConfig.fontFamily) {
      lines.push(`          fontFamily: "${config.suggestionChipsConfig.fontFamily}",`);
    }
    if (config.suggestionChipsConfig.fontWeight) {
      lines.push(`          fontWeight: "${config.suggestionChipsConfig.fontWeight}",`);
    }
    if (config.suggestionChipsConfig.paddingX) {
      lines.push(`          paddingX: "${config.suggestionChipsConfig.paddingX}",`);
    }
    if (config.suggestionChipsConfig.paddingY) {
      lines.push(`          paddingY: "${config.suggestionChipsConfig.paddingY}",`);
    }
    lines.push("        },");
  }

  // Add toolCall config
  lines.push(...generateToolCallConfig(config, "        "));

  // Add messageActions config (with hook callbacks if provided)
  lines.push(...generateMessageActionsConfig(config, "        ", hooks));

  // Add markdown config
  lines.push(...generateMarkdownConfig(config, "        "));

  // Add layout config
  lines.push(...generateLayoutConfig(config, "        "));

  // Add getHeaders if provided
  if (hooks?.getHeaders) {
    lines.push(`        getHeaders: ${hooks.getHeaders},`);
  }

  // Add contextProviders if provided
  if (hooks?.contextProviders) {
    lines.push(`        contextProviders: ${hooks.contextProviders},`);
  }

  if (config.debug) {
    lines.push(`        debug: ${config.debug},`);
  }

  lines.push("        initialMessages: loadSavedMessages(),");

  // Stream parser - use custom if provided, otherwise default
  if (hooks?.streamParser) {
    lines.push(`        streamParser: ${hooks.streamParser},`);
  } else {
    lines.push("        // Flexible JSON stream parser for handling structured actions");
    lines.push(`        streamParser: () => createFlexibleJsonStreamParser(${TEMPLATE_STREAM_PARSER_CALLBACK_TS}),`);
  }

  // Action parsers - merge custom with defaults if provided
  if (hooks?.actionParsers) {
    lines.push("        // Action parsers (custom merged with defaults)");
    lines.push(`        actionParsers: [...(${hooks.actionParsers}), defaultJsonActionParser,`);
    lines.push(`          // Built-in parser for markdown-wrapped JSON`);
    lines.push(`          ${TEMPLATE_MARKDOWN_JSON_PARSER_TS}`);
    lines.push("        ],");
  } else {
    lines.push("        // Action parsers to detect JSON actions in responses");
    lines.push("        actionParsers: [");
    lines.push("          defaultJsonActionParser,");
    lines.push(`          // Parser for markdown-wrapped JSON`);
    lines.push(`          ${TEMPLATE_MARKDOWN_JSON_PARSER_TS}`);
    lines.push("        ],");
  }

  // Action handlers - merge custom with defaults if provided
  if (hooks?.actionHandlers) {
    lines.push("        // Action handlers (custom merged with defaults)");
    lines.push(`        actionHandlers: [...(${hooks.actionHandlers}),`);
    lines.push("          defaultActionHandlers.message,");
    lines.push("          defaultActionHandlers.messageAndClick,");
    lines.push(`          // Built-in handler for nav_then_click action`);
    lines.push(`          ${TEMPLATE_NAV_THEN_CLICK_HANDLER_TS}`);
    lines.push("        ],");
  } else {
    lines.push("        // Action handlers for navigation and other actions");
    lines.push("        actionHandlers: [");
    lines.push("          defaultActionHandlers.message,");
    lines.push("          defaultActionHandlers.messageAndClick,");
    lines.push(`          // Handler for nav_then_click action`);
    lines.push(`          ${TEMPLATE_NAV_THEN_CLICK_HANDLER_TS}`);
    lines.push("        ],");
  }

  // postprocessMessage - use custom if provided, otherwise default
  if (hooks?.postprocessMessage) {
    lines.push(`        postprocessMessage: ${hooks.postprocessMessage},`);
  } else {
    lines.push("        postprocessMessage: ({ text }) => markdownPostprocessor(text),");
  }

  // requestMiddleware - merge custom with DOM context if provided
  if (hooks?.requestMiddleware) {
    lines.push("        // Request middleware (custom merged with DOM context)");
    lines.push("        requestMiddleware: ({ payload, config }) => {");
    lines.push(`          const customResult = (${hooks.requestMiddleware})({ payload, config });`);
    lines.push("          const merged = customResult || payload;");
    lines.push("          return {");
    lines.push("            ...merged,");
    lines.push("            metadata: { ...merged.metadata, ...collectDOMContext() }");
    lines.push("          };");
    lines.push("        }");
  } else {
    lines.push("        requestMiddleware: ({ payload }) => {");
    lines.push("          return {");
    lines.push("            ...payload,");
    lines.push("            metadata: collectDOMContext()");
    lines.push("          };");
    lines.push("        }");
  }
  lines.push("      }");
  lines.push("    });");
  lines.push("");
  lines.push("    // Save state on message events");
  lines.push("    const handleMessage = () => {");
  lines.push("      const session = handle?.getSession?.();");
  lines.push("      if (session) {");
  lines.push("        localStorage.setItem(STORAGE_KEY, JSON.stringify({");
  lines.push("          messages: session.messages,");
  lines.push("          timestamp: new Date().toISOString()");
  lines.push("        }));");
  lines.push("      }");
  lines.push("    };");
  lines.push("");
  lines.push("    // Clear state on clear chat");
  lines.push("    const handleClearChat = () => {");
  lines.push("      localStorage.removeItem(STORAGE_KEY);");
  lines.push("      localStorage.removeItem(PROCESSED_ACTIONS_KEY);");
  lines.push("    };");
  lines.push("");
  lines.push("    window.addEventListener('persona:message', handleMessage);");
  lines.push("    window.addEventListener('persona:clear-chat', handleClearChat);");
  lines.push("");
  lines.push("    // Cleanup on unmount");
  lines.push("    return () => {");
  lines.push("      window.removeEventListener('persona:message', handleMessage);");
  lines.push("      window.removeEventListener('persona:clear-chat', handleClearChat);");
  lines.push("      if (handle) {");
  lines.push("        handle.destroy();");
  lines.push("      }");
  lines.push("    };");
  lines.push("  }, []);");
  lines.push("");
  lines.push("  return null; // Widget injects itself into the DOM");
  lines.push("}");
  lines.push("");
  lines.push("// Usage: Collects DOM context for AI-powered navigation");
  lines.push("// Features:");
  lines.push("// - Extracts page elements (products, buttons, links)");
  lines.push("// - Persists chat history across page loads");
  lines.push("// - Handles navigation actions (nav_then_click)");
  lines.push("// - Processes structured JSON actions from AI");
  lines.push("//");
  lines.push("// Example usage in Next.js:");
  lines.push("// import { ChatWidgetAdvanced } from './components/ChatWidgetAdvanced';");
  lines.push("//");
  lines.push("// export default function RootLayout({ children }) {");
  lines.push("//   return (");
  lines.push("//     <html lang=\"en\">");
  lines.push("//       <body>");
  lines.push("//         {children}");
  lines.push("//         <ChatWidgetAdvanced />");
  lines.push("//       </body>");
  lines.push("//     </html>");
  lines.push("//   );");
  lines.push("// }");

  return lines.join("\n");
}

// Helper to build a serializable config object for JSON export
function buildSerializableConfig(config: any): Record<string, any> {
  const parserType = getParserTypeFromConfig(config as AgentWidgetConfig);
  const shouldEmitParserType = parserType !== "plain";
  
  const serializableConfig: Record<string, any> = {};
  
  if (config.apiUrl) serializableConfig.apiUrl = config.apiUrl;
  if (config.clientToken) serializableConfig.clientToken = config.clientToken;
  if (config.flowId) serializableConfig.flowId = config.flowId;
  if (shouldEmitParserType) serializableConfig.parserType = parserType;
  if (config.theme) serializableConfig.theme = config.theme;
  if (config.launcher) serializableConfig.launcher = config.launcher;
  if (config.copy) serializableConfig.copy = config.copy;
  if (config.sendButton) serializableConfig.sendButton = config.sendButton;
  if (config.voiceRecognition) serializableConfig.voiceRecognition = config.voiceRecognition;
  if (config.statusIndicator) serializableConfig.statusIndicator = config.statusIndicator;
  if (config.features) serializableConfig.features = config.features;
  if (config.suggestionChips?.length > 0) serializableConfig.suggestionChips = config.suggestionChips;
  if (config.suggestionChipsConfig) serializableConfig.suggestionChipsConfig = config.suggestionChipsConfig;
  if (config.debug) serializableConfig.debug = config.debug;
  
  // Add toolCall config (only serializable parts)
  if (config.toolCall) {
    const toolCallConfig: Record<string, any> = {};
    Object.entries(config.toolCall).forEach(([key, value]) => {
      if (typeof value === "string") toolCallConfig[key] = value;
    });
    if (Object.keys(toolCallConfig).length > 0) {
      serializableConfig.toolCall = toolCallConfig;
    }
  }
  
  // Add messageActions config (excluding callbacks)
  if (config.messageActions) {
    const messageActionsConfig: Record<string, any> = {};
    Object.entries(config.messageActions).forEach(([key, value]) => {
      if (key !== "onFeedback" && key !== "onCopy" && value !== undefined) {
        if (typeof value === "string" || typeof value === "boolean") {
          messageActionsConfig[key] = value;
        }
      }
    });
    if (Object.keys(messageActionsConfig).length > 0) {
      serializableConfig.messageActions = messageActionsConfig;
    }
  }
  
  // Add markdown config (excluding renderer functions)
  if (config.markdown) {
    const markdownConfig: Record<string, any> = {};
    if (config.markdown.options) markdownConfig.options = config.markdown.options;
    if (config.markdown.disableDefaultStyles !== undefined) {
      markdownConfig.disableDefaultStyles = config.markdown.disableDefaultStyles;
    }
    if (Object.keys(markdownConfig).length > 0) {
      serializableConfig.markdown = markdownConfig;
    }
  }
  
  // Add layout config (excluding render functions)
  if (config.layout) {
    const layoutConfig: Record<string, any> = {};
    
    if (config.layout.header) {
      const headerConfig: Record<string, any> = {};
      Object.entries(config.layout.header).forEach(([key, value]) => {
        if (key !== "render" && (typeof value === "string" || typeof value === "boolean")) {
          headerConfig[key] = value;
        }
      });
      if (Object.keys(headerConfig).length > 0) {
        layoutConfig.header = headerConfig;
      }
    }
    
    if (config.layout.messages) {
      const messagesConfig: Record<string, any> = {};
      Object.entries(config.layout.messages).forEach(([key, value]) => {
        if (key !== "renderUserMessage" && key !== "renderAssistantMessage") {
          if (key === "avatar" && typeof value === "object" && value !== null) {
            messagesConfig.avatar = value;
          } else if (key === "timestamp" && typeof value === "object" && value !== null) {
            // Exclude format function
            const tsConfig: Record<string, any> = {};
            Object.entries(value as Record<string, unknown>).forEach(([tsKey, tsValue]) => {
              if (tsKey !== "format" && (typeof tsValue === "string" || typeof tsValue === "boolean")) {
                tsConfig[tsKey] = tsValue;
              }
            });
            if (Object.keys(tsConfig).length > 0) {
              messagesConfig.timestamp = tsConfig;
            }
          } else if (typeof value === "string" || typeof value === "boolean") {
            messagesConfig[key] = value;
          }
        }
      });
      if (Object.keys(messagesConfig).length > 0) {
        layoutConfig.messages = messagesConfig;
      }
    }
    
    if (Object.keys(layoutConfig).length > 0) {
      serializableConfig.layout = layoutConfig;
    }
  }
  
  return serializableConfig;
}

function generateScriptInstallerCode(config: any, options?: CodeGeneratorOptions): string {
  const serializableConfig = buildSerializableConfig(config);

  // When windowKey is provided, nest the widget config under `config` so the
  // install script's parsedConfig.config detection picks it up alongside windowKey.
  const payload = options?.windowKey
    ? { config: serializableConfig, windowKey: options.windowKey }
    : serializableConfig;

  // Escape single quotes in JSON for HTML attribute
  const configJson = JSON.stringify(payload, null, 0).replace(/'/g, "&#39;");

  return `<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@${VERSION}/dist/install.global.js" data-config='${configJson}'></script>`;
}

function generateScriptManualCode(config: any, options?: CodeGeneratorOptions): string {
  const hooks = options?.hooks;
  const parserType = getParserTypeFromConfig(config as AgentWidgetConfig);
  const shouldEmitParserType = parserType !== "plain";

  const lines: string[] = [
    "<!-- Load CSS -->",
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@${VERSION}/dist/widget.css" />`,
    "",
    "<!-- Load JavaScript -->",
    `<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@${VERSION}/dist/index.global.js"></script>`,
    "",
    "<!-- Initialize widget -->",
    "<script>",
    "  var handle = window.AgentWidget.initAgentWidget({",
    "    target: 'body',",
    ...(options?.windowKey ? [`    windowKey: '${options.windowKey}',`] : []),
    "    config: {"
  ];

  if (config.apiUrl) lines.push(`      apiUrl: "${config.apiUrl}",`);
  if (config.clientToken) lines.push(`      clientToken: "${config.clientToken}",`);
  if (config.flowId) lines.push(`      flowId: "${config.flowId}",`);
  if (shouldEmitParserType) lines.push(`      parserType: "${parserType}",`);

  if (config.theme && typeof config.theme === "object" && Object.keys(config.theme).length > 0) {
    appendSerializableObjectBlock(lines, "theme", config.theme as Record<string, unknown>, "      ");
  }

  if (config.launcher) {
    appendSerializableObjectBlock(lines, "launcher", config.launcher, "      ");
  }

  if (config.copy) {
    lines.push("      copy: {");
    Object.entries(config.copy).forEach(([key, value]) => {
      lines.push(`        ${key}: "${value}",`);
    });
    lines.push("      },");
  }

  if (config.sendButton) {
    lines.push("      sendButton: {");
    Object.entries(config.sendButton).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`        ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`        ${key}: ${value},`);
      }
    });
    lines.push("      },");
  }

  if (config.voiceRecognition) {
    lines.push("      voiceRecognition: {");
    Object.entries(config.voiceRecognition).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`        ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`        ${key}: ${value},`);
      } else if (typeof value === "number") {
        lines.push(`        ${key}: ${value},`);
      }
    });
    lines.push("      },");
  }

  if (config.statusIndicator) {
    lines.push("      statusIndicator: {");
    Object.entries(config.statusIndicator).forEach(([key, value]) => {
      if (typeof value === "string") {
        lines.push(`        ${key}: "${value}",`);
      } else if (typeof value === "boolean") {
        lines.push(`        ${key}: ${value},`);
      }
    });
    lines.push("      },");
  }

  if (config.features) {
    lines.push("      features: {");
    Object.entries(config.features).forEach(([key, value]) => {
      lines.push(`        ${key}: ${value},`);
    });
    lines.push("      },");
  }

  if (config.suggestionChips && config.suggestionChips.length > 0) {
    lines.push("      suggestionChips: [");
    config.suggestionChips.forEach((chip: string) => {
      lines.push(`        "${chip}",`);
    });
    lines.push("      ],");
  }

  if (config.suggestionChipsConfig) {
    lines.push("      suggestionChipsConfig: {");
    if (config.suggestionChipsConfig.fontFamily) {
      lines.push(`        fontFamily: "${config.suggestionChipsConfig.fontFamily}",`);
    }
    if (config.suggestionChipsConfig.fontWeight) {
      lines.push(`        fontWeight: "${config.suggestionChipsConfig.fontWeight}",`);
    }
    if (config.suggestionChipsConfig.paddingX) {
      lines.push(`        paddingX: "${config.suggestionChipsConfig.paddingX}",`);
    }
    if (config.suggestionChipsConfig.paddingY) {
      lines.push(`        paddingY: "${config.suggestionChipsConfig.paddingY}",`);
    }
    lines.push("      },");
  }

  // Add toolCall config
  lines.push(...generateToolCallConfig(config, "      "));

  // Add messageActions config (with hook callbacks if provided)
  lines.push(...generateMessageActionsConfig(config, "      ", hooks));

  // Add markdown config
  lines.push(...generateMarkdownConfig(config, "      "));

  // Add layout config
  lines.push(...generateLayoutConfig(config, "      "));

  // Add hook-based config (getHeaders, requestMiddleware, actionParsers, actionHandlers, etc.)
  lines.push(...generateHooksConfig(hooks, "      "));

  if (config.debug) {
    lines.push(`      debug: ${config.debug},`);
  }

  // Use custom postprocessMessage if provided, otherwise default
  if (hooks?.postprocessMessage) {
    lines.push(`      postprocessMessage: ${hooks.postprocessMessage}`);
  } else {
    lines.push("      postprocessMessage: ({ text }) => window.AgentWidget.markdownPostprocessor(text)");
  }
  lines.push("    }");
  lines.push("  });");
  lines.push("</script>");

  return lines.join("\n");
}

function generateScriptAdvancedCode(config: any, options?: CodeGeneratorOptions): string {
  const hooks = options?.hooks;
  const serializableConfig = buildSerializableConfig(config);
  const configJson = JSON.stringify(serializableConfig, null, 2);

  const lines: string[] = [
    "<script>",
    "(function() {",
    "  'use strict';",
    "",
    "  // Configuration",
    `  var CONFIG = ${configJson.split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')};`,
    "",
    "  // Constants",
    `  var CDN_BASE = 'https://cdn.jsdelivr.net/npm/@runtypelabs/persona@${VERSION}/dist';`,
    "  var STORAGE_KEY = 'chat-widget-state';",
    "  var PROCESSED_ACTIONS_KEY = 'chat-widget-processed-actions';",
    "",
    "  // DOM context provider - extracts page elements for AI context",
    "  var domContextProvider = function() {",
    "    var selectors = {",
    "      products: '[data-product-id], .product-card, .product-item, [role=\"article\"]',",
    "      buttons: 'button, [role=\"button\"], .btn',",
    "      links: 'a[href]',",
    "      inputs: 'input, textarea, select'",
    "    };",
    "",
    "    var elements = [];",
    "    Object.entries(selectors).forEach(function(entry) {",
    "      var type = entry[0], selector = entry[1];",
    "      document.querySelectorAll(selector).forEach(function(element) {",
    "        if (!(element instanceof HTMLElement)) return;",
    "        var widgetHost = element.closest('.persona-host');",
    "        if (widgetHost) return;",
    "        var text = element.innerText ? element.innerText.trim() : '';",
    "        if (!text) return;",
    "",
    "        var selectorString = element.id ? '#' + element.id :",
    "          element.getAttribute('data-testid') ? '[data-testid=\"' + element.getAttribute('data-testid') + '\"]' :",
    "          element.getAttribute('data-product-id') ? '[data-product-id=\"' + element.getAttribute('data-product-id') + '\"]' :",
    "          element.tagName.toLowerCase();",
    "",
    "        var elementData = {",
    "          type: type,",
    "          tagName: element.tagName.toLowerCase(),",
    "          selector: selectorString,",
    "          innerText: text.substring(0, 200)",
    "        };",
    "",
    "        if (type === 'links' && element instanceof HTMLAnchorElement && element.href) {",
    "          elementData.href = element.href;",
    "        }",
    "        elements.push(elementData);",
    "      });",
    "    });",
    "",
    "    var counts = elements.reduce(function(acc, el) {",
    "      acc[el.type] = (acc[el.type] || 0) + 1;",
    "      return acc;",
    "    }, {});",
    "",
    "    return {",
    "      page_elements: elements.slice(0, 50),",
    "      page_element_count: elements.length,",
    "      element_types: counts,",
    "      page_url: window.location.href,",
    "      page_title: document.title,",
    "      timestamp: new Date().toISOString()",
    "    };",
    "  };",
    "",
    "  // Load CSS dynamically",
    "  var loadCSS = function() {",
    "    if (document.querySelector('link[data-persona]')) return;",
    "    var link = document.createElement('link');",
    "    link.rel = 'stylesheet';",
    "    link.href = CDN_BASE + '/widget.css';",
    "    link.setAttribute('data-persona', 'true');",
    "    document.head.appendChild(link);",
    "  };",
    "",
    "  // Load JS dynamically",
    "  var loadJS = function(callback) {",
    "    if (window.AgentWidget) { callback(); return; }",
    "    var script = document.createElement('script');",
    "    script.src = CDN_BASE + '/index.global.js';",
    "    script.onload = callback;",
    "    script.onerror = function() { console.error('Failed to load AgentWidget'); };",
    "    document.head.appendChild(script);",
    "  };",
    "",
    "  // Create widget config with advanced features",
    "  var createWidgetConfig = function(agentWidget) {",
    "    var widgetConfig = Object.assign({}, CONFIG);",
    ""
  ];

  // Add getHeaders if provided
  if (hooks?.getHeaders) {
    lines.push(`    widgetConfig.getHeaders = ${hooks.getHeaders};`);
    lines.push("");
  }

  // Add contextProviders if provided
  if (hooks?.contextProviders) {
    lines.push(`    widgetConfig.contextProviders = ${hooks.contextProviders};`);
    lines.push("");
  }

  // Stream parser - use custom if provided, otherwise default
  if (hooks?.streamParser) {
    lines.push(`    widgetConfig.streamParser = ${hooks.streamParser};`);
  } else {
    lines.push("    // Flexible JSON stream parser for handling structured actions");
    lines.push("    widgetConfig.streamParser = function() {");
    lines.push(`      return agentWidget.createFlexibleJsonStreamParser(${TEMPLATE_STREAM_PARSER_CALLBACK_ES5});`);
    lines.push("    };");
  }
  lines.push("");

  // Action parsers - merge custom with defaults if provided
  if (hooks?.actionParsers) {
    lines.push("    // Action parsers (custom merged with defaults)");
    lines.push(`    var customParsers = ${hooks.actionParsers};`);
    lines.push("    widgetConfig.actionParsers = customParsers.concat([");
    lines.push("      agentWidget.defaultJsonActionParser,");
    lines.push(`      ${TEMPLATE_MARKDOWN_JSON_PARSER_ES5}`);
    lines.push("    ]);");
  } else {
    lines.push("    // Action parsers to detect JSON actions in responses");
    lines.push("    widgetConfig.actionParsers = [");
    lines.push("      agentWidget.defaultJsonActionParser,");
    lines.push(`      ${TEMPLATE_MARKDOWN_JSON_PARSER_ES5}`);
    lines.push("    ];");
  }
  lines.push("");

  // Action handlers - merge custom with defaults if provided
  if (hooks?.actionHandlers) {
    lines.push("    // Action handlers (custom merged with defaults)");
    lines.push(`    var customHandlers = ${hooks.actionHandlers};`);
    lines.push("    widgetConfig.actionHandlers = customHandlers.concat([");
    lines.push("      agentWidget.defaultActionHandlers.message,");
    lines.push("      agentWidget.defaultActionHandlers.messageAndClick,");
    lines.push(`      ${TEMPLATE_NAV_THEN_CLICK_HANDLER_ES5}`);
    lines.push("    ]);");
  } else {
    lines.push("    // Action handlers for navigation and other actions");
    lines.push("    widgetConfig.actionHandlers = [");
    lines.push("      agentWidget.defaultActionHandlers.message,");
    lines.push("      agentWidget.defaultActionHandlers.messageAndClick,");
    lines.push(`      ${TEMPLATE_NAV_THEN_CLICK_HANDLER_ES5}`);
    lines.push("    ];");
  }
  lines.push("");

  // requestMiddleware - merge custom with DOM context if provided
  if (hooks?.requestMiddleware) {
    lines.push("    // Request middleware (custom merged with DOM context)");
    lines.push("    widgetConfig.requestMiddleware = function(ctx) {");
    lines.push(`      var customResult = (${hooks.requestMiddleware})(ctx);`);
    lines.push("      var merged = customResult || ctx.payload;");
    lines.push("      return Object.assign({}, merged, { metadata: Object.assign({}, merged.metadata, domContextProvider()) });");
    lines.push("    };");
  } else {
    lines.push("    // Send DOM context with each request");
    lines.push("    widgetConfig.requestMiddleware = function(ctx) {");
    lines.push("      return Object.assign({}, ctx.payload, { metadata: domContextProvider() });");
    lines.push("    };");
  }
  lines.push("");

  // postprocessMessage - use custom if provided, otherwise default
  if (hooks?.postprocessMessage) {
    lines.push(`    widgetConfig.postprocessMessage = ${hooks.postprocessMessage};`);
  } else {
    lines.push("    // Markdown postprocessor");
    lines.push("    widgetConfig.postprocessMessage = function(ctx) {");
    lines.push("      return agentWidget.markdownPostprocessor(ctx.text);");
    lines.push("    };");
  }
  lines.push("");

  // Add messageActions callbacks if provided
  if (hooks?.onFeedback || hooks?.onCopy) {
    lines.push("    // Message action callbacks");
    lines.push("    widgetConfig.messageActions = widgetConfig.messageActions || {};");
    if (hooks?.onFeedback) {
      lines.push(`    widgetConfig.messageActions.onFeedback = ${hooks.onFeedback};`);
    }
    if (hooks?.onCopy) {
      lines.push(`    widgetConfig.messageActions.onCopy = ${hooks.onCopy};`);
    }
    lines.push("");
  }

  lines.push(...[
    "    return widgetConfig;",
    "  };",
    "",
    "  // Initialize widget",
    "  var init = function() {",
    "    var agentWidget = window.AgentWidget;",
    "    if (!agentWidget) {",
    "      console.error('AgentWidget not loaded');",
    "      return;",
    "    }",
    "",
    "    var widgetConfig = createWidgetConfig(agentWidget);",
    "",
    "    // Load saved state",
    "    var savedState = localStorage.getItem(STORAGE_KEY);",
    "    if (savedState) {",
    "      try {",
    "        var parsed = JSON.parse(savedState);",
    "        widgetConfig.initialMessages = parsed.messages || [];",
    "      } catch (e) {",
    "        console.error('Failed to load saved state:', e);",
    "      }",
    "    }",
    "",
    "    // Initialize widget",
    "    var handle = agentWidget.initAgentWidget({",
    "      target: 'body',",
    "      useShadowDom: false,",
    ...(options?.windowKey ? [`      windowKey: '${options.windowKey}',`] : []),
    "      config: widgetConfig",
    "    });",
    "",
    "    // Save state on message events",
    "    window.addEventListener('persona:message', function() {",
    "      var session = handle.getSession ? handle.getSession() : null;",
    "      if (session) {",
    "        localStorage.setItem(STORAGE_KEY, JSON.stringify({",
    "          messages: session.messages,",
    "          timestamp: new Date().toISOString()",
    "        }));",
    "      }",
    "    });",
    "",
    "    // Clear state on clear chat",
    "    window.addEventListener('persona:clear-chat', function() {",
    "      localStorage.removeItem(STORAGE_KEY);",
    "      localStorage.removeItem(PROCESSED_ACTIONS_KEY);",
    "    });",
    "  };",
    "",
    "  // Wait for framework hydration to complete (Next.js, Nuxt, etc.)",
    "  // This prevents the framework from removing dynamically added CSS during reconciliation",
    "  var waitForHydration = function(callback) {",
    "    var executed = false;",
    "    ",
    "    var execute = function() {",
    "      if (executed) return;",
    "      executed = true;",
    "      callback();",
    "    };",
    "",
    "    var afterDom = function() {",
    "      // Strategy 1: Use requestIdleCallback if available (best for detecting idle after hydration)",
    "      if (typeof requestIdleCallback !== 'undefined') {",
    "        requestIdleCallback(function() {",
    "          // Double requestAnimationFrame ensures at least one full paint cycle completed",
    "          requestAnimationFrame(function() {",
    "            requestAnimationFrame(execute);",
    "          });",
    "        }, { timeout: 3000 }); // Max wait 3 seconds, then proceed anyway",
    "      } else {",
    "        // Strategy 2: Fallback for Safari (no requestIdleCallback)",
    "        // 300ms is typically enough for hydration on most pages",
    "        setTimeout(execute, 300);",
    "      }",
    "    };",
    "",
    "    if (document.readyState === 'loading') {",
    "      document.addEventListener('DOMContentLoaded', afterDom);",
    "    } else {",
    "      // DOM already ready, but still wait for potential hydration",
    "      afterDom();",
    "    }",
    "  };",
    "",
    "  // Boot sequence: wait for hydration, then load CSS and JS, then initialize",
    "  // This prevents Next.js/Nuxt/etc. from removing dynamically added CSS during reconciliation",
    "  waitForHydration(function() {",
    "    loadCSS();",
    "    loadJS(function() {",
    "      init();",
    "    });",
    "  });",
    "})();",
    "</script>"
  ]);

  return lines.join("\n");
}
