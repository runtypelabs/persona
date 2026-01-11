import { Marked, type RendererObject } from "marked";
import type { AgentWidgetMarkdownConfig, AgentWidgetMarkdownRendererOverrides, AgentWidgetMarkdownOptions } from "./types";

/**
 * Options for creating a markdown processor
 */
export type MarkdownProcessorOptions = {
  /** Marked parsing options */
  markedOptions?: AgentWidgetMarkdownOptions;
  /** Custom renderer overrides */
  renderer?: AgentWidgetMarkdownRendererOverrides;
};

/**
 * Converts AgentWidgetMarkdownRendererOverrides to marked's RendererObject format
 */
const convertRendererOverrides = (
  overrides?: AgentWidgetMarkdownRendererOverrides
): Partial<RendererObject> | undefined => {
  if (!overrides) return undefined;
  
  // The token-based API in marked v12+ matches our type definitions
  // We can pass through the overrides directly
  return overrides as Partial<RendererObject>;
};

/**
 * Creates a configured markdown processor with custom options and renderers.
 * 
 * @param options - Configuration options for the markdown processor
 * @returns A function that converts markdown text to HTML
 * 
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const processor = createMarkdownProcessor();
 * const html = processor("# Hello World");
 * 
 * // With custom options
 * const processor = createMarkdownProcessor({
 *   markedOptions: { gfm: true, breaks: true },
 *   renderer: {
 *     link(token) {
 *       return `<a href="${token.href}" target="_blank">${token.text}</a>`;
 *     }
 *   }
 * });
 * ```
 */
export const createMarkdownProcessor = (options?: MarkdownProcessorOptions) => {
  const opts = options?.markedOptions;
  const markedInstance = new Marked({
    gfm: opts?.gfm ?? true,
    breaks: opts?.breaks ?? true,
    pedantic: opts?.pedantic,
    silent: opts?.silent,
  });
  
  const rendererOverrides = convertRendererOverrides(options?.renderer);
  if (rendererOverrides) {
    markedInstance.use({ renderer: rendererOverrides });
  }
  
  return (text: string): string => {
    return markedInstance.parse(text) as string;
  };
};

/**
 * Creates a markdown processor from AgentWidgetMarkdownConfig.
 * This is a convenience function that maps the widget config to processor options.
 * 
 * @param config - The markdown configuration from widget config
 * @returns A function that converts markdown text to HTML
 */
export const createMarkdownProcessorFromConfig = (config?: AgentWidgetMarkdownConfig) => {
  if (!config) {
    return createMarkdownProcessor();
  }
  
  return createMarkdownProcessor({
    markedOptions: config.options,
    renderer: config.renderer,
  });
};

// Create default markdown processor instance
const defaultMarkdownProcessor = createMarkdownProcessor();

/**
 * Basic markdown renderer using default settings.
 * Remember to sanitize the returned HTML if you render untrusted content in your host page.
 * 
 * For custom configuration, use `createMarkdownProcessor()` or `createMarkdownProcessorFromConfig()`.
 */
export const markdownPostprocessor = (text: string): string => {
  return defaultMarkdownProcessor(text);
};

/**
 * Escapes HTML entities. Used as the default safe renderer.
 */
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttribute = (value: string) =>
  value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const makeToken = (idx: number) => `%%FORM_PLACEHOLDER_${idx}%%`;

const directiveReplacer = (source: string, placeholders: Array<{ token: string; type: string }>) => {
  let working = source;

  // JSON directive pattern e.g. <Directive>{"component":"form","type":"init"}</Directive>
  working = working.replace(/<Directive>([\s\S]*?)<\/Directive>/gi, (match, jsonText) => {
    try {
      const parsed = JSON.parse(jsonText.trim());
      if (parsed && typeof parsed === "object" && parsed.component === "form" && parsed.type) {
        const token = makeToken(placeholders.length);
        placeholders.push({ token, type: String(parsed.type) });
        return token;
      }
    } catch (error) {
      return match;
    }
    return match;
  });

  // XML-style directive e.g. <Form type="init" />
  working = working.replace(/<Form\s+type="([^"]+)"\s*\/>/gi, (_, type) => {
    const token = makeToken(placeholders.length);
    placeholders.push({ token, type });
    return token;
  });

  return working;
};

/**
 * Creates a directive postprocessor with custom markdown configuration.
 * Converts special directives (either `<Form type="init" />` or
 * `<Directive>{"component":"form","type":"init"}</Directive>`) into placeholder
 * elements that the widget upgrades after render. Remaining text is rendered as
 * Markdown with the provided configuration.
 * 
 * @param markdownConfig - Optional markdown configuration
 * @returns A function that processes text with directives and markdown
 */
export const createDirectivePostprocessor = (markdownConfig?: AgentWidgetMarkdownConfig) => {
  const processor = createMarkdownProcessorFromConfig(markdownConfig);
  
  return (text: string): string => {
    const placeholders: Array<{ token: string; type: string }> = [];
    const withTokens = directiveReplacer(text, placeholders);
    let html = processor(withTokens);

    placeholders.forEach(({ token, type }) => {
      const tokenRegex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const safeType = escapeAttribute(type);
      const replacement = `<div class="tvw-form-directive" data-tv-form="${safeType}"></div>`;
      html = html.replace(tokenRegex, replacement);
    });

    return html;
  };
};

/**
 * Converts special directives (either `<Form type="init" />` or
 * `<Directive>{"component":"form","type":"init"}</Directive>`) into placeholder
 * elements that the widget upgrades after render. Remaining text is rendered as
 * Markdown using default settings.
 * 
 * For custom markdown configuration, use `createDirectivePostprocessor()`.
 */
export const directivePostprocessor = (text: string): string => {
  const placeholders: Array<{ token: string; type: string }> = [];
  const withTokens = directiveReplacer(text, placeholders);
  let html = markdownPostprocessor(withTokens);

  placeholders.forEach(({ token, type }) => {
    const tokenRegex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const safeType = escapeAttribute(type);
    const replacement = `<div class="tvw-form-directive" data-tv-form="${safeType}"></div>`;
    html = html.replace(tokenRegex, replacement);
  });

  return html;
};
