import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { DEFAULT_TOOL_CALL_DISPLAY, DEFAULT_REASONING_DISPLAY, DEFAULTS_V5 } from "../defaults";

// Pure helpers and the per-widget lifecycle stay in core (ui.ts uses them at
// mount and on every render). The DOM builders live in `activity-row-render.ts`,
// which ships in the lazy activity-ui chunk with the tool/reasoning bubbles.

export type ActivityKind = "tool" | "reasoning";

/** Standalone builders and the full UI use the same versioned defaults. */
export function activityDisplay(config: AgentWidgetConfig | undefined, kind: ActivityKind): AgentWidgetConfig {
  const key = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  return { ...config, features: { ...config?.features, [key]: {
    ...(kind === "tool" ? DEFAULT_TOOL_CALL_DISPLAY : DEFAULT_REASONING_DISPLAY),
    ...(config?.future?.v5Defaults === true ? DEFAULTS_V5.features?.[key] : {}),
    ...config?.features?.[key],
  } } };
}

export function activityVariant(config: AgentWidgetConfig | undefined, kind: ActivityKind): "card" | "row" {
  const key = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  return config?.features?.[key]?.variant ?? (config?.future?.v5Defaults ? "row" : "card");
}

export function activityDuration(ms: number | undefined): string {
  const seconds = Math.max(0, Math.floor((ms ?? 0) / 1000));
  if (seconds < 1) return "a moment";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Per-widget lifecycle: one open and one delayed close; user intent is sticky. */
export function createActivityLifecycle(onCollapse: (id: string, kind: ActivityKind) => void) {
  const seen = new Set<string>();
  const manual = new Set<string>();
  const finished = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const cancel = (id: string) => { clearTimeout(timers.get(id)); timers.delete(id); };
  return {
    observe(message: AgentWidgetMessage, kind: ActivityKind, expanded: Set<string>, options: { autoExpand?: boolean; autoCollapseDelay?: number | false } = {}) {
      const data = kind === "tool" ? message.toolCall : message.reasoning;
      if (!data || manual.has(message.id)) return;
      if (!seen.has(message.id) && data.status !== "complete" && data.chunks?.some(Boolean)) {
        seen.add(message.id);
        if (options.autoExpand !== false) expanded.add(message.id);
      }
      if (seen.has(message.id) && data.status === "complete" && !finished.has(message.id)) {
        finished.add(message.id);
        if (options.autoCollapseDelay === false) return;
        timers.set(message.id, setTimeout(() => {
          timers.delete(message.id);
          expanded.delete(message.id);
          onCollapse(message.id, kind);
        }, options.autoCollapseDelay ?? 1000));
      }
    },
    manual(id: string) { manual.add(id); cancel(id); },
    prune(ids: Set<string>) {
      for (const id of new Set([...seen, ...manual, ...finished])) {
        if (!ids.has(id)) { cancel(id); seen.delete(id); manual.delete(id); finished.delete(id); }
      }
    },
    clear() { for (const id of timers.keys()) cancel(id); seen.clear(); manual.clear(); finished.clear(); },
  };
}
