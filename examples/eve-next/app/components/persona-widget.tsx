"use client";

import { useEffect, useRef } from "react";
import { createAgentExperience, markdownPostprocessor, type AgentWidgetMessage } from "@runtypelabs/persona";

const toolLabels: Record<string, { active: string; complete: string }> = {
  read_document: { active: "Reading document", complete: "Read document" },
  review_milestones: { active: "Reviewing milestones", complete: "Reviewed milestones" },
};

function toolLabel(tool: NonNullable<AgentWidgetMessage["toolCall"]>): string | null {
  // Let Persona retain its own failure, interruption, and approval wording.
  if (tool.success === false || tool.interrupted || tool.superseded ||
      tool.approvalStatus === "pending" || tool.approvalStatus === "denied" || tool.approvalStatus === "timeout") return null;
  const labels = toolLabels[tool.name ?? ""];
  if (!labels) return null;
  return tool.status === "complete" ? labels.complete : labels.active;
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
        title: "Ask about this document",
        subtitle: "",
        variant: "card",
        layout: "top",
        align: "start",
      },
      copy: { inputPlaceholder: "Ask about this document…" },
      suggestions: {
        starters: { items: ["Summarize this document", "Find launch risks", "Draft next steps"], behavior: "send", variant: "chip", placement: "welcome", overflow: "wrap", maxItems: 3 },
      },
      features: { showToolCalls: true, showReasoning: true },
      toolCall: {
        renderCollapsedSummary: ({ toolCall }) => toolLabel(toolCall),
      },
      theme: {
        semantic: { colors: { accent: "#252525", primary: "#252525", background: "#ffffff", surface: "#ffffff" } },
        components: {
          introCard: { background: "transparent", shadow: "none", padding: "0", title: { fontSize: "18px", lineHeight: "24px" } },
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
