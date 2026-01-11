import { parse as parsePartialJson, STR, OBJ } from "partial-json";

/**
 * Represents a component directive extracted from JSON
 */
export interface ComponentDirective {
  component: string;
  props: Record<string, unknown>;
  raw: string;
}

/**
 * Checks if a parsed object is a component directive
 */
function isComponentDirective(obj: unknown): obj is { component: string; props?: unknown } {
  if (!obj || typeof obj !== "object") return false;
  if (!("component" in obj)) return false;
  const component = (obj as { component: unknown }).component;
  return typeof component === "string" && component.length > 0;
}

/**
 * Extracts component directive from parsed JSON object
 */
function extractComponentDirective(
  parsed: unknown,
  rawJson: string
): ComponentDirective | null {
  if (!isComponentDirective(parsed)) {
    return null;
  }

  const props = parsed.props && typeof parsed.props === "object" && parsed.props !== null
    ? (parsed.props as Record<string, unknown>)
    : {};

  return {
    component: parsed.component,
    props,
    raw: rawJson
  };
}

/**
 * Creates a parser that extracts component directives from JSON streams
 * This parser looks for objects with a "component" field and extracts
 * the component name and props incrementally as they stream in.
 */
export function createComponentStreamParser() {
  let extractedDirective: ComponentDirective | null = null;
  let processedLength = 0;

  return {
    /**
     * Get the currently extracted component directive
     */
    getExtractedDirective: (): ComponentDirective | null => {
      return extractedDirective;
    },

    /**
     * Process a chunk of JSON and extract component directive if present
     */
    processChunk: (accumulatedContent: string): ComponentDirective | null => {
      // Validate that the accumulated content looks like JSON
      const trimmed = accumulatedContent.trim();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        return null;
      }

      // Skip if no new content
      if (accumulatedContent.length <= processedLength) {
        return extractedDirective;
      }

      try {
        // Parse partial JSON - allow partial strings and objects during streaming
        // STR | OBJ allows incomplete strings and objects during streaming
        const parsed = parsePartialJson(accumulatedContent, STR | OBJ);

        // Try to extract component directive
        const directive = extractComponentDirective(parsed, accumulatedContent);
        if (directive) {
          extractedDirective = directive;
        }
      } catch (error) {
        // If parsing fails completely, keep the last extracted directive
        // This can happen with very malformed JSON during streaming
      }

      // Update processed length
      processedLength = accumulatedContent.length;

      return extractedDirective;
    },

    /**
     * Reset the parser state
     */
    reset: () => {
      extractedDirective = null;
      processedLength = 0;
    }
  };
}

/**
 * Type guard to check if an object is a component directive
 */
export function isComponentDirectiveType(obj: unknown): obj is ComponentDirective {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "component" in obj &&
    typeof (obj as { component: unknown }).component === "string" &&
    "props" in obj &&
    typeof (obj as { props: unknown }).props === "object"
  );
}
