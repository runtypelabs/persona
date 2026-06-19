"use client";

import { useEffect } from "react";
import { createAgentExperience, markdownPostprocessor } from "@runtypelabs/persona";

type PersonaWidgetProps = {
  apiUrl: string;
  title: string;
  subtitle: string;
  accent?: string;
  suggestionChips?: string[];
};

export function PersonaWidget({
  apiUrl,
  title,
  subtitle,
  accent = "#157f8f",
  suggestionChips,
}: PersonaWidgetProps) {
  useEffect(() => {
    const host = document.getElementById("persona-root");
    if (!host) return;

    let handle: ReturnType<typeof createAgentExperience> | null = createAgentExperience(host, {
      // Proxy mode: no clientToken, just the local /dispatch route. The adapter
      // emits Persona's SSE event vocabulary, which the widget auto-detects
      // from the leading `execution_start` frame (the same wire the Runtype API emits).
      apiUrl,
      launcher: { enabled: false },
      copy: {
        welcomeTitle: title,
        welcomeSubtitle: subtitle,
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
      },
      suggestionChips,
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });

    return () => {
      handle?.destroy();
      handle = null;
      host.replaceChildren();
    };
  }, [apiUrl, title, subtitle, accent, suggestionChips]);

  return <div id="persona-root" />;
}
