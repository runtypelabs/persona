"use client";

import { useEffect } from "react";
import { createAgentExperience, markdownPostprocessor } from "@runtypelabs/persona";

type PersonaWidgetProps = {
  apiUrl: string;
  title: string;
  subtitle: string;
  accent?: string;
  starterItems?: string[];
};

export function PersonaWidget({
  apiUrl,
  title,
  subtitle,
  accent = "#157f8f",
  starterItems,
}: PersonaWidgetProps) {
  useEffect(() => {
    const host = document.getElementById("persona-root");
    if (!host) return;

    let handle: ReturnType<typeof createAgentExperience> | null = createAgentExperience(host, {
      // Proxy mode: no clientToken, just the local /dispatch route. The adapter
      // emits Persona's SSE event vocabulary, which the widget auto-detects
      // from the leading `execution_start` frame (the same wire the Runtype API emits).
      apiUrl,
      launcher: { enabled: false, width: "100%" },
      welcome: { title, subtitle, variant: "card" },
      copy: {
        inputPlaceholder: "Ask anything...",
      },
      theme: {
        semantic: {
          colors: {
            accent,
            surface: "#ffffff",
            background: "#f7f8fb",
            primary: "#121826",
          },
        },
        components: {
          introCard: {
            background: "transparent",
            shadow: "none",
          },
          panel: {
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            shadow: "0 12px 32px rgb(18 24 38 / 8%)",
          },
        },
      },
      suggestions: {
        starters: {
          items: starterItems,
          variant: "chip",
          placement: "composer",
          overflow: "wrap",
          maxItems: 4,
        },
      },
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });

    return () => {
      handle?.destroy();
      handle = null;
      host.replaceChildren();
    };
  }, [apiUrl, title, subtitle, accent, starterItems]);

  return <div id="persona-root" />;
}
