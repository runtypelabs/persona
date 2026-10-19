"use client";

import { useEffect, useRef } from "react";
import { createAgentExperience, markdownPostprocessor, type AgentWidgetMessage } from "@runtypelabs/persona";

const toolLabels: Record<string, { active: string; complete: string; groupComplete: string }> = {
  read_document: { active: "Reading document", complete: "Read document", groupComplete: "Read documents" },
  review_milestones: { active: "Reviewing milestones", complete: "Reviewed milestones", groupComplete: "Reviewed milestones" },
};

function toolLabel(tool: NonNullable<AgentWidgetMessage["toolCall"]>, grouped = false): string | null {
  // Let Persona retain its own failure, interruption, and approval wording.
  if (tool.success === false || tool.interrupted || tool.superseded ||
      tool.approvalStatus === "pending" || tool.approvalStatus === "denied" || tool.approvalStatus === "timeout") return null;
  const labels = toolLabels[tool.name ?? ""];
  if (!labels) return null;
  return tool.status === "complete" ? (grouped ? labels.groupComplete : labels.complete) : labels.active;
}

export function PersonaWidget({ apiUrl }: { apiUrl: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const handle = createAgentExperience(host, {
      apiUrl,
      future: { v5Defaults: true },
      colorScheme: "light",
      persistState: false,
      launcher: { enabled: false },
      layout: { embedded: true },
      composer: { placement: "block" },
      welcome: {
        title: "A fresh perspective,\nright beside your work.",
        subtitle: "Turn this document into a clear summary, a sharper question, or your next step.",
        variant: "card",
      },
      copy: { inputPlaceholder: "Ask about this document…" },
      suggestions: {
        starters: { items: ["Summarize this document", "Find launch risks", "Draft next steps"], behavior: "send", variant: "chip", placement: "welcome", overflow: "wrap", maxItems: 3 },
      },
      features: { showToolCalls: true, showReasoning: true },
      toolCall: {
        renderCollapsedSummary: ({ toolCall }) => toolLabel(toolCall),
        renderGroupedSummary: ({ toolCalls }) => {
          const labels = toolCalls.map((tool) => toolLabel(tool, true));
          if (labels.some((label) => label === null)) return null;
          return [...new Set(labels.filter((label) => label !== null))].map((label, index) => index ? label.charAt(0).toLowerCase() + label.slice(1) : label).join(", ");
        },
      },
      theme: {
        semantic: { colors: { accent: "#252525", primary: "#252525", background: "#ffffff", surface: "#ffffff" } },
        components: {
          introCard: { background: "transparent", shadow: "none" },
          input: { background: "#fff" },
          activity: { bodySurface: "transparent" },
        },
      },
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });
    return () => { handle.destroy(); host.replaceChildren(); };
  }, [apiUrl]);
  return <div ref={root} className="persona-host" />;
}
