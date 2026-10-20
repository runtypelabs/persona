import type { AgentWidgetReasoning, AgentWidgetToolCall } from "../types";

export const formatReasoningDuration = (reasoning: AgentWidgetReasoning) => {
  const end = reasoning.completedAt ?? Date.now();
  const start = reasoning.startedAt ?? end;
  const durationMs =
    reasoning.durationMs !== undefined
      ? reasoning.durationMs
      : Math.max(0, end - start);
  return `Thought for ${formatElapsedMs(durationMs).slice(0, -1)} seconds`;
};

export const describeReasonStatus = (reasoning: AgentWidgetReasoning) => {
  if (reasoning.status === "complete") return formatReasoningDuration(reasoning);
  if (reasoning.status === "pending") return "Waiting";
  return "";
};

/** Defaults for `features.reasoningDisplay.shortThinkThreshold`. */
export const DEFAULT_SHORT_THINK_DURATION_MS = 15_000;
export const DEFAULT_SHORT_THINK_CHARS = 1_200;

/**
 * A completed reasoning trace is short when its duration is under the
 * threshold, or (with no reported duration) its streamed text is under the
 * character threshold. Duration is preferred when available.
 */
export const isShortReasoning = (
  reasoning: AgentWidgetReasoning,
  threshold?: { durationMs?: number; chars?: number }
): boolean => {
  const durationThreshold = threshold?.durationMs ?? DEFAULT_SHORT_THINK_DURATION_MS;
  const charsThreshold = threshold?.chars ?? DEFAULT_SHORT_THINK_CHARS;
  if (typeof reasoning.durationMs === "number") {
    return reasoning.durationMs < durationThreshold;
  }
  const chars = (reasoning.chunks ?? []).join("").length;
  return chars < charsThreshold;
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
  return `Used tool for ${formatElapsedMs(durationMs).slice(0, -1)} seconds`;
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
  if (
    tool.interrupted && tool.duration === undefined && tool.durationMs === undefined &&
    (tool.startedAt === undefined || tool.completedAt === undefined)
  ) return "";
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

