import { AgentWidgetReasoning, AgentWidgetToolCall, AgentWidgetStreamParser, AgentWidgetStreamParserResult } from "../types";
import { parse as parsePartialJson, STR, OBJ } from "partial-json";

/**
 * Unescapes JSON string escape sequences that LLMs often double-escape.
 * Converts literal \n, \r, \t sequences to actual control characters.
 */
const unescapeJsonString = (str: string): string => {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

export const formatUnknownValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

export const formatReasoningDuration = (reasoning: AgentWidgetReasoning) => {
  const end = reasoning.completedAt ?? Date.now();
  const start = reasoning.startedAt ?? end;
  const durationMs =
    reasoning.durationMs !== undefined
      ? reasoning.durationMs
      : Math.max(0, end - start);
  const seconds = durationMs / 1000;
  if (seconds < 0.1) {
    return "Thought for <0.1 seconds";
  }
  const formatted =
    seconds >= 10
      ? Math.round(seconds).toString()
      : seconds.toFixed(1).replace(/\.0$/, "");
  return `Thought for ${formatted} seconds`;
};

export const describeReasonStatus = (reasoning: AgentWidgetReasoning) => {
  if (reasoning.status === "complete") return formatReasoningDuration(reasoning);
  if (reasoning.status === "pending") return "Waiting";
  return "";
};

export const formatToolDuration = (tool: AgentWidgetToolCall) => {
  const durationMs =
    typeof tool.duration === "number"
      ? tool.duration
      : typeof tool.durationMs === "number"
        ? tool.durationMs
        : Math.max(
            0,
            (tool.completedAt ?? Date.now()) -
              (tool.startedAt ?? tool.completedAt ?? Date.now())
          );
  const seconds = durationMs / 1000;
  if (seconds < 0.1) {
    return "Used tool for <0.1 seconds";
  }
  const formatted =
    seconds >= 10
      ? Math.round(seconds).toString()
      : seconds.toFixed(1).replace(/\.0$/, "");
  return `Used tool for ${formatted} seconds`;
};

export const describeToolStatus = (status: AgentWidgetToolCall["status"]) => {
  if (status === "complete") return "";
  if (status === "pending") return "Starting";
  return "Running";
};

export const describeToolTitle = (tool: AgentWidgetToolCall) => {
  if (tool.status === "complete") {
    return formatToolDuration(tool);
  }
  return "Using tool...";
};

/**
 * Formats a millisecond duration as a short human-readable string.
 * Returns "2.3s", "15s", or "<0.1s".
 */
export const formatElapsedMs = (ms: number): string => {
  const seconds = ms / 1000;
  if (seconds < 0.1) return "<0.1s";
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  return `${seconds.toFixed(1).replace(/\.0$/, "")}s`;
};

/**
 * Computes the current elapsed time string for a tool call.
 */
export const computeToolElapsed = (tool: AgentWidgetToolCall): string => {
  const durationMs =
    typeof tool.duration === "number"
      ? tool.duration
      : typeof tool.durationMs === "number"
        ? tool.durationMs
        : Math.max(
            0,
            (tool.completedAt ?? Date.now()) -
              (tool.startedAt ?? tool.completedAt ?? Date.now())
          );
  return formatElapsedMs(durationMs);
};

/**
 * Computes the current elapsed time string for a reasoning block.
 */
export const computeReasoningElapsed = (reasoning: AgentWidgetReasoning): string => {
  const durationMs =
    reasoning.durationMs !== undefined
      ? reasoning.durationMs
      : Math.max(
          0,
          (reasoning.completedAt ?? Date.now()) -
            (reasoning.startedAt ?? reasoning.completedAt ?? Date.now())
        );
  return formatElapsedMs(durationMs);
};

/**
 * Resolves a text template with tool call placeholders.
 * Supported placeholders: {toolName}, {duration}
 * Returns the fallback if template is undefined.
 */
export const resolveToolHeaderText = (
  tool: AgentWidgetToolCall,
  template: string | undefined,
  fallback: string
): string => {
  if (!template) return fallback;

  const toolName = tool.name?.trim() || "tool";
  const duration = computeToolElapsed(tool);

  return template
    .replace(/\{toolName\}/g, toolName)
    .replace(/\{duration\}/g, duration);
};

/**
 * A segment of parsed template text with optional inline formatting.
 */
export interface TemplateSegment {
  /** The text content (or "{duration}" for duration placeholders) */
  text: string;
  /** CSS modifier names to apply: "dim", "bold", "italic" */
  styles: string[];
  /** True when this segment represents a {duration} placeholder */
  isDuration?: boolean;
}

/**
 * Parses a template string with inline formatting markers into segments.
 *
 * Supported markers (Markdown-like):
 * - `**text**` → bold
 * - `*text*`  → italic
 * - `~text~`  → dim / muted
 *
 * Placeholders `{toolName}` are resolved; `{duration}` is preserved as a
 * typed segment so the caller can render it as a live-updating DOM node.
 *
 * @example
 * parseFormattedTemplate("Finished {toolName} ~{duration}~", "Get Weather")
 * // → [
 * //   { text: "Finished Get Weather ", styles: [] },
 * //   { text: "{duration}", styles: ["dim"], isDuration: true }
 * // ]
 */
export const parseFormattedTemplate = (
  template: string,
  toolName: string
): TemplateSegment[] => {
  const resolved = template.replace(/\{toolName\}/g, toolName);
  const segments: TemplateSegment[] = [];
  // Order matters: ** must match before *
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|~(.+?)~/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(resolved)) !== null) {
    if (match.index > lastIndex) {
      pushSegments(segments, resolved.slice(lastIndex, match.index), []);
    }

    if (match[1] !== undefined) {
      pushSegments(segments, match[1], ["bold"]);
    } else if (match[2] !== undefined) {
      pushSegments(segments, match[2], ["italic"]);
    } else if (match[3] !== undefined) {
      pushSegments(segments, match[3], ["dim"]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < resolved.length) {
    pushSegments(segments, resolved.slice(lastIndex), []);
  }

  return segments;
};

/** Splits text on {duration} and pushes typed segments. */
const pushSegments = (
  segments: TemplateSegment[],
  text: string,
  styles: string[]
): void => {
  const parts = text.split("{duration}");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      segments.push({ text: parts[i], styles });
    }
    if (i < parts.length - 1) {
      segments.push({ text: "{duration}", styles, isDuration: true });
    }
  }
};

/**
 * Creates a regex-based parser for extracting text from JSON streams.
 * This is a simpler alternative to schema-stream that uses regex to extract
 * the 'text' field incrementally as JSON streams in.
 * 
 * This can be used as an alternative parser option.
 */
const createRegexJsonParserInternal = (): {
  processChunk(accumulatedContent: string): Promise<AgentWidgetStreamParserResult | string | null>;
  getExtractedText(): string | null;
  close?(): Promise<void>;
} => {
  let extractedText: string | null = null;
  let processedLength = 0;
  
  // Regex-based extraction for incremental JSON parsing
  const extractTextFromIncompleteJson = (jsonString: string): string | null => {
    // Look for "text": "value" pattern, handling incomplete strings
    // Match: "text": " followed by any characters (including incomplete)
    const textFieldRegex = /"text"\s*:\s*"((?:[^"\\]|\\.|")*?)"/;
    const match = jsonString.match(textFieldRegex);
    
    if (match && match[1]) {
      // Unescape the string value
      try {
        // Replace escaped characters
        let unescaped = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        return unescaped;
      } catch {
        return match[1];
      }
    }
    
    // Also try to match incomplete text field (text field that hasn't closed yet)
    // Look for "text": " followed by content that may not be closed
    const incompleteTextFieldRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)/;
    const incompleteMatch = jsonString.match(incompleteTextFieldRegex);
    
    if (incompleteMatch && incompleteMatch[1]) {
      // Unescape the partial string value
      try {
        let unescaped = incompleteMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        return unescaped;
      } catch {
        return incompleteMatch[1];
      }
    }
    
    return null;
  };
  
  return {
    getExtractedText: () => extractedText,
    processChunk: async (accumulatedContent: string): Promise<AgentWidgetStreamParserResult | string | null> => {
      // Skip if no new content
      if (accumulatedContent.length <= processedLength) {
        return extractedText !== null
          ? { text: extractedText, raw: accumulatedContent }
          : null;
      }
      
      // Validate that the accumulated content looks like valid JSON
      const trimmed = accumulatedContent.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
      }
      
      // Try to extract text field using regex
      const extracted = extractTextFromIncompleteJson(accumulatedContent);
      if (extracted !== null) {
        extractedText = extracted;
      }
      
      // Update processed length
      processedLength = accumulatedContent.length;
      
      // Return both the extracted text and raw JSON
      if (extractedText !== null) {
        return {
          text: extractedText,
          raw: accumulatedContent
        };
      }

      return null;
    },
    close: async () => {
      // No cleanup needed for regex-based parser
    }
  };
};

/**
 * Extracts the text field from JSON (works with partial JSON during streaming).
 * For complete JSON, uses fast path. For incomplete JSON, returns null (use stateful parser in client.ts).
 * 
 * @param jsonString - The JSON string (can be partial/incomplete during streaming)
 * @returns The extracted text value, or null if not found or invalid
 */
export const extractTextFromJson = (jsonString: string): string | null => {
  try {
    // Try to parse complete JSON first (fast path)
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      return parsed.text;
    }
  } catch {
    // For incomplete JSON, return null - use stateful parser in client.ts
    return null;
  }
  return null;
};

/**
 * Plain text parser - passes through text as-is without any parsing.
 * This is the default parser.
 */
export const createPlainTextParser = (): AgentWidgetStreamParser => {
  const parser: AgentWidgetStreamParser = {
    processChunk: (_accumulatedContent: string): string | null => {
      // Always return null to indicate this isn't a structured format
      // Content will be displayed as plain text
      return null;
    },
    getExtractedText: (): string | null => {
      return null;
    }
  };
  // Mark this as a plain text parser
  (parser as any).__isPlainTextParser = true;
  return parser;
};

/**
 * JSON parser using regex-based extraction.
 * Extracts the 'text' field from JSON responses using regex patterns.
 * This is a simpler regex-based alternative to createJsonStreamParser.
 * Less robust for complex/malformed JSON but has no external dependencies.
 */
export const createRegexJsonParser = (): AgentWidgetStreamParser => {
  const regexParser = createRegexJsonParserInternal();
  
  return {
    processChunk: async (accumulatedContent: string): Promise<AgentWidgetStreamParserResult | string | null> => {
      // Only process if it looks like JSON
      const trimmed = accumulatedContent.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
      }
      return regexParser.processChunk(accumulatedContent);
    },
    getExtractedText: regexParser.getExtractedText.bind(regexParser),
    close: regexParser.close?.bind(regexParser)
  };
};

/**
 * JSON stream parser using partial-json library.
 * Extracts the 'text' field from JSON responses using the partial-json library,
 * which is specifically designed for parsing incomplete JSON from LLMs.
 * This is the recommended parser as it's more robust than regex.
 * 
 * Library: https://github.com/promplate/partial-json-parser-js
 */
export const createJsonStreamParser = (): AgentWidgetStreamParser => {
  let extractedText: string | null = null;
  let processedLength = 0;
  
  return {
    getExtractedText: () => extractedText,
    processChunk: (accumulatedContent: string): AgentWidgetStreamParserResult | string | null => {
      // Validate that the accumulated content looks like JSON
      const trimmed = accumulatedContent.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
      }
      
      // Skip if no new content
      if (accumulatedContent.length <= processedLength) {
        return extractedText !== null || extractedText === ""
          ? { text: extractedText || "", raw: accumulatedContent }
          : null;
      }
      
      try {
        // Parse partial JSON - allow partial strings and objects
        // STR | OBJ allows incomplete strings and objects during streaming
        const parsed = parsePartialJson(accumulatedContent, STR | OBJ);
        
        if (parsed && typeof parsed === "object") {
          // Check for component directives - extract text if present for combined text+component
          if (parsed.component && typeof parsed.component === "string") {
            // For component directives, extract text if present, otherwise empty
            extractedText = typeof parsed.text === "string" ? unescapeJsonString(parsed.text) : "";
          }
          // Check for form directives - these also don't have text fields
          else if (parsed.type === "init" && parsed.form) {
            // For form directives, return empty - they're handled by form postprocessor
            extractedText = "";
          }
          // Extract text field if available
          else if (typeof parsed.text === "string") {
            extractedText = unescapeJsonString(parsed.text);
          }
        }
      } catch (error) {
        // If parsing fails completely, keep the last extracted text
        // This can happen with very malformed JSON
      }
      
      // Update processed length
      processedLength = accumulatedContent.length;
      
      // Always return raw JSON for component/form directive detection
      // Return empty string for text if it's a component/form directive
      if (extractedText !== null) {
        return {
          text: extractedText,
          raw: accumulatedContent
        };
      }

      return null;
    },
    close: () => {
      // No cleanup needed
    }
  };
};

/**
 * Flexible JSON stream parser that can extract text from various field names.
 * This parser looks for display text in multiple possible fields, making it
 * compatible with different JSON response formats.
 * 
 * @param textExtractor Optional function to extract display text from parsed JSON.
 *                      If not provided, looks for common text fields.
 */
export const createFlexibleJsonStreamParser = (
  textExtractor?: (parsed: any) => string | null
): AgentWidgetStreamParser => {
  let extractedText: string | null = null;
  let processedLength = 0;
  
  // Default text extractor that handles common patterns
  const defaultExtractor = (parsed: any): string | null => {
    if (!parsed || typeof parsed !== "object") return null;

    // Helper to safely extract and unescape text
    const getText = (value: any): string | null => {
      return typeof value === "string" ? unescapeJsonString(value) : null;
    };

    // Check for component directives - extract text if present for combined text+component
    if (parsed.component && typeof parsed.component === "string") {
      // For component directives, extract text if present, otherwise empty
      return typeof parsed.text === "string" ? unescapeJsonString(parsed.text) : "";
    }
    
    // Check for form directives - these also don't have text fields
    if (parsed.type === "init" && parsed.form) {
      // For form directives, return empty - they're handled by form postprocessor
      return "";
    }
    
    // Check for action-based text fields
    if (parsed.action) {
      switch (parsed.action) {
        case 'nav_then_click':
          return getText(parsed.on_load_text) || getText(parsed.text) || null;
        case 'message':
        case 'message_and_click':
        case 'checkout':
          return getText(parsed.text) || null;
        default:
          return getText(parsed.text) || getText(parsed.display_text) || getText(parsed.message) || null;
      }
    }
    
    // Fallback to common text field names
    return getText(parsed.text) || getText(parsed.display_text) || getText(parsed.message) || getText(parsed.content) || null;
  };
  
  const extractText = textExtractor || defaultExtractor;
  
  return {
    getExtractedText: () => extractedText,
    processChunk: (accumulatedContent: string): AgentWidgetStreamParserResult | string | null => {
      // Validate that the accumulated content looks like JSON
      const trimmed = accumulatedContent.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
      }
      
      // Skip if no new content
      if (accumulatedContent.length <= processedLength) {
        return extractedText !== null
          ? { text: extractedText, raw: accumulatedContent }
          : null;
      }
      
      try {
        // Parse partial JSON - allow partial strings and objects
        // STR | OBJ allows incomplete strings and objects during streaming
        const parsed = parsePartialJson(accumulatedContent, STR | OBJ);
        
        // Extract text using the provided or default extractor
        const newText = extractText(parsed);
        if (newText !== null) {
          extractedText = newText;
        }
      } catch (error) {
        // If parsing fails completely, keep the last extracted text
        // This can happen with very malformed JSON
      }
      
      // Update processed length
      processedLength = accumulatedContent.length;
      
      // Always return the raw JSON for action parsing and component detection
      // Text may be null or empty for component/form directives, that's ok
      return {
        text: extractedText || "",
        raw: accumulatedContent
      };
    },
    close: () => {
      // No cleanup needed
    }
  };
};

/**
 * XML stream parser.
 * Extracts text from <text>...</text> tags in XML responses.
 */
export const createXmlParser = (): AgentWidgetStreamParser => {
  let extractedText: string | null = null;
  
  return {
    processChunk: (accumulatedContent: string): AgentWidgetStreamParserResult | string | null => {
      // Return null if not XML format
      const trimmed = accumulatedContent.trim();
      if (!trimmed.startsWith('<')) {
        return null;
      }
      
      // Extract text from <text>...</text> tags
      // Handle both <text>content</text> and <text attr="value">content</text>
      const match = accumulatedContent.match(/<text[^>]*>([\s\S]*?)<\/text>/);
      if (match && match[1]) {
        extractedText = match[1];
        // For XML, we typically don't need the raw content for middleware
        // but we can include it for consistency
        return { text: extractedText, raw: accumulatedContent };
      }
      
      return null;
    },
    getExtractedText: (): string | null => {
      return extractedText;
    }
  };
};







