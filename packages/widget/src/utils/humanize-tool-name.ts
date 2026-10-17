import { WEBMCP_TOOL_PREFIX } from "../webmcp-bridge";

/**
 * Turn a wire tool name into a user-facing label: strips the `webmcp:`
 * prefix and splits snake_case / kebab-case / camelCase into a sentence
 * (`add_to_cart` → "Add to cart"). Falls back to the input when nothing
 * word-like remains.
 */
export const humanizeToolName = (toolName: string): string => {
  const bare = toolName.startsWith(WEBMCP_TOOL_PREFIX)
    ? toolName.slice(WEBMCP_TOOL_PREFIX.length)
    : toolName;
  const words = bare
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\-\s.]+/)
    .filter(Boolean);
  if (words.length === 0) return toolName;
  const sentence = words.join(" ").toLowerCase();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};

