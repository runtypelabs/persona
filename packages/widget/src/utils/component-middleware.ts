import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { componentRegistry, ComponentContext } from "../components/registry";
import { ComponentDirective, createComponentStreamParser } from "./component-parser";
import { createStandardBubble, MessageTransform } from "../components/message-bubble";

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
 * Checks if a message contains a component directive in its raw content
 */
export function hasComponentDirective(message: AgentWidgetMessage): boolean {
  if (!message.rawContent) return false;
  
  try {
    const parsed = JSON.parse(message.rawContent);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "component" in parsed &&
      typeof parsed.component === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Extracts component directive from a complete message
 */
export function extractComponentDirectiveFromMessage(
  message: AgentWidgetMessage
): ComponentDirective | null {
  if (!message.rawContent) return null;

  try {
    const parsed = JSON.parse(message.rawContent);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "component" in parsed &&
      typeof parsed.component === "string"
    ) {
      return {
        component: parsed.component,
        props: (parsed.props && typeof parsed.props === "object" && parsed.props !== null
          ? parsed.props
          : {}) as Record<string, unknown>,
        raw: message.rawContent
      };
    }
  } catch {
    // Not valid JSON or not a component directive
  }

  return null;
}
