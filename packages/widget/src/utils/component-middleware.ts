import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { componentRegistry, ComponentContext } from "../components/registry";
import { ComponentDirective, createComponentStreamParser } from "./component-parser";
import { createStandardBubble as _createStandardBubble, MessageTransform } from "../components/message-bubble";

/**
 * Options for component middleware
 */
export interface ComponentMiddlewareOptions {
  config: AgentWidgetConfig;
  message: AgentWidgetMessage;
  transform: MessageTransform;
  onPropsUpdate?: (props: Record<string, unknown>) => void;
}

/**
 * Renders a component directive into an HTMLElement
 */
export function renderComponentDirective(
  directive: ComponentDirective,
  options: ComponentMiddlewareOptions
): HTMLElement | null {
  const { config, message, onPropsUpdate } = options;

  // Get component renderer from registry
  const renderer = componentRegistry.get(directive.component);
  if (!renderer) {
    // Component not found, fall back to default rendering
    console.warn(
      `[ComponentMiddleware] Component "${directive.component}" not found in registry. Falling back to default rendering.`
    );
    return null;
  }

  // Create component context
  const context: ComponentContext = {
    message,
    config,
    updateProps: (newProps: Record<string, unknown>) => {
      if (onPropsUpdate) {
        onPropsUpdate(newProps);
      }
    }
  };

  try {
    // Render the component
    const element = renderer(directive.props, context);
    return element;
  } catch (error) {
    console.error(
      `[ComponentMiddleware] Error rendering component "${directive.component}":`,
      error
    );
    return null;
  }
}

/**
 * Creates middleware that processes component directives from streamed JSON
 */
export function createComponentMiddleware() {
  const parser = createComponentStreamParser();

  return {
    /**
     * Process accumulated content and extract component directive
     */
    processChunk: (accumulatedContent: string): ComponentDirective | null => {
      return parser.processChunk(accumulatedContent);
    },

    /**
     * Get the currently extracted directive
     */
    getDirective: (): ComponentDirective | null => {
      return parser.getExtractedDirective();
    },

    /**
     * Reset the parser state
     */
    reset: () => {
      parser.reset();
    }
  };
}

/**
 * Picks the field that may carry a JSON directive payload. Streamed messages
 * populate `rawContent`; manually injected messages may pass the JSON via
 * `content` directly. We try `rawContent` first, then fall back to `content`
 * when it looks like JSON, so both code paths render the same way.
 */
function selectDirectiveSource(message: AgentWidgetMessage): string | null {
  if (typeof message.rawContent === "string" && message.rawContent.length > 0) {
    return message.rawContent;
  }
  if (typeof message.content === "string") {
    const trimmed = message.content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return message.content;
    }
  }
  return null;
}

/**
 * Checks if a message contains a component directive.
 *
 * Looks at `rawContent` first (the field set by stream parsers); falls back
 * to `content` when it looks like JSON, so injected messages that pass the
 * directive via `content` (or have no `rawContent`) are still recognized.
 */
export function hasComponentDirective(message: AgentWidgetMessage): boolean {
  const source = selectDirectiveSource(message);
  if (!source) return false;

  try {
    const parsed = JSON.parse(source);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "component" in parsed &&
      typeof (parsed as { component: unknown }).component === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Extracts component directive from a complete message.
 *
 * Looks at `rawContent` first (the field set by stream parsers); falls back
 * to `content` when it looks like JSON, so injected messages that pass the
 * directive via `content` (or have no `rawContent`) render the same as
 * streamed ones.
 */
export function extractComponentDirectiveFromMessage(
  message: AgentWidgetMessage
): ComponentDirective | null {
  const source = selectDirectiveSource(message);
  if (!source) return null;

  try {
    const parsed = JSON.parse(source);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "component" in parsed &&
      typeof (parsed as { component: unknown }).component === "string"
    ) {
      const directive = parsed as { component: string; props?: unknown };
      return {
        component: directive.component,
        props: (directive.props && typeof directive.props === "object" && directive.props !== null
          ? directive.props
          : {}) as Record<string, unknown>,
        raw: source
      };
    }
  } catch {
    // Not valid JSON or not a component directive
  }

  return null;
}
