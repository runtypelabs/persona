import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetTurnActivity } from "../types";
import { toolActivityIcon, resolveToolIcon, toolActivityLabel } from "./tool-activity-summary";
import { getActivityStyles } from "../components/activity-deps";

/** Event types classify tool/reasoning activity; prose requires an explicit phase. */
function nativeActivity(message: AgentWidgetMessage): AgentWidgetTurnActivity | undefined {
  const { executionId, phase } = message.agentMetadata ?? {};
  if (message.role !== "assistant" || typeof executionId !== "string" || !executionId) return;
  const kind = message.variant === "tool" || message.variant === "reasoning" || phase === "commentary"
    ? "progress" : phase === "partial_answer" || phase === "final_answer" ? "final" : undefined;
  if (kind) return { id: executionId, kind, startedAt: Date.parse(message.createdAt) };
}


const compactDisplay = {
  toolCallDisplay: { variant: "row", grouped: true, groupedMode: "collapsible", autoExpand: false, iconVisibility: "always" },
  reasoningDisplay: { variant: "row", autoExpand: false, iconVisibility: "always" },
} as const;
const compactPaths = Object.entries(compactDisplay).flatMap(([key, values]) =>
  Object.keys(values).map(leaf => `features.${key}.${leaf}`));
const presentations = new WeakMap<AgentWidgetConfig, AgentWidgetConfig>();

export function classify(message: AgentWidgetMessage, config: AgentWidgetConfig) {
  return message.turnActivity ?? config.turnActivity?.resolveMessage?.(message) ?? nativeActivity(message);
}

export const needsAttention = (message: AgentWidgetMessage) => {
  const tool = message.toolCall!;
  const approval = message.approval?.status ?? tool.approvalStatus;
  return tool.error || tool.interrupted || tool.success === false || tool.superseded || approval && approval !== "approved";
};
/** Host-authored display text only; no argument or transport-schema inspection. */
export const resolveActionTitle = (message: AgentWidgetMessage, config?: AgentWidgetConfig) =>
  message.toolCall?.actionTitle?.trim() || config?.toolCall?.resolveActionTitle?.(message.toolCall!, message)?.trim() || undefined;

export const currentToolLabel = (message: AgentWidgetMessage, config?: AgentWidgetConfig) =>
  resolveActionTitle(message, config) || toolActivityLabel(message.toolCall!);

/** Shared single-action policy for every group surface. Attention and parallel work stay aggregate. */
export function groupToolSummary(messages: AgentWidgetMessage[], config: AgentWidgetConfig, aggregate: string) {
  const active = messages.filter(message => message.toolCall?.status !== "complete");
  return config.features?.toolCallDisplay?.groupSummary === "current-action" && active.length === 1 && !messages.some(needsAttention)
    ? currentToolLabel(active[0], config) : aggregate;
}

/** Defaults are local to classified progress; authored values and preferences win. */
export function presentation(config: AgentWidgetConfig, message: AgentWidgetMessage): AgentWidgetConfig {
  if (!config.turnActivity?.enabled || message.role !== "assistant" || classify(message, config)?.kind !== "progress") return config;
  const cached = presentations.get(config);
  if (cached) return cached;
  const { defaultProvenance, suppliedPath } = getActivityStyles();
  const explicit = defaultProvenance(config, compactPaths);
  const features = { ...config.features };
  for (const key of ["toolCallDisplay", "reasoningDisplay"] as const) {
    const display = { ...features[key] };
    for (const [leaf, value] of Object.entries(compactDisplay[key])) {
      if (!explicit.includes(`features.${key}.${leaf}`) && suppliedPath(config.preferences, `${key}.${leaf}`) !== "explicit") {
        Object.assign(display, { [leaf]: value });
      }
    }
    features[key] = display;
  }
  features.toolCallDisplay = { ...features.toolCallDisplay,
    groupSummary: features.toolCallDisplay?.groupSummary ?? (features.toolCallDisplay?.groupedMode === "stack" ? "aggregate" : "current-action"),
  };
  const result = { ...config, features, toolCall: { ...config.toolCall,
    iconName: typeof config.toolCall?.iconName === "string" ? config.toolCall.iconName
      : (tool: NonNullable<AgentWidgetMessage["toolCall"]>) => resolveToolIcon(tool, config) ?? toolActivityIcon(tool),
  } };
  presentations.set(config, result);
  return result;
}

