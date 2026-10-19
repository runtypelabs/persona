"use client";

import { useEffect, useRef, useState } from "react";
import { createAgentExperience, markdownPostprocessor } from "@runtypelabs/persona";
import { renderToolActivitySummary } from "../lib/tool-activity-summary";

const starters = ["Research a thoughtful product launch", "Compare three launch strategies", "Build a launch checklist"];
type PersonaWidgetProps = { apiUrl: string; conversationId: number; preview: boolean; onTitle: (id: number, title: string) => void };

export function PersonaWidget({ apiUrl, conversationId, preview, onTitle }: PersonaWidgetProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = createAgentExperience(host, {
      apiUrl,
      persistState: false,
      future: { v5Defaults: true },
      turnActivity: { enabled: true },
      launcher: { enabled: false, width: "100%" },
      layout: { embedded: true, showHeader: false },
      welcome: { title: "What can I help with?", subtitle: "", variant: "card", layout: "centered", anchor: "center" },
      copy: { inputPlaceholder: preview ? "Ask about a product launch…" : "Ask anything…" },
      theme: {
        semantic: { colors: { accent: "#202020", surface: "#ffffff", background: "#ffffff", primary: "#202020" } },
        components: { introCard: { background: "transparent", shadow: "none", padding: "0" }, panel: { border: "none", borderRadius: "0", shadow: "none" } },
      },
      toolCall: { renderGroupedSummary: renderToolActivitySummary },
      suggestions: { starters: { items: starters, variant: "chip", placement: "composer", overflow: "wrap", maxItems: 3 } },
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });
    const clearError = handle.on("run:started", () => setError(null));
    let titled = false;
    const updateTitle = handle.on("user:message", message => {
      if (!titled && message.content) {
        titled = true;
        onTitle(conversationId, message.content.slice(0, 54));
      }
    });
    const showError = handle.on("run:finished", ({ outcome }) => {
      if (outcome === "error") setError("This request could not finish. Try again, or check your server’s provider credentials and model settings.");
    });
    return () => { clearError(); updateTitle(); showError(); handle.destroy(); host.replaceChildren(); };
  }, [apiUrl, conversationId, onTitle, preview]);
  return <>{error && <p className="providerError" role="alert">{error}</p>}<div className="personaHost" ref={hostRef} /></>;
}
