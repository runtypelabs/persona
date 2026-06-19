"use client";

import { useEffect } from "react";
import {
  createAgentExperience,
  markdownPostprocessor,
} from "@runtypelabs/persona";

type PersonaWidgetProps = {
  apiUrl: string;
  title: string;
};

export function PersonaWidget({ apiUrl, title }: PersonaWidgetProps) {
  useEffect(() => {
    const host = document.getElementById("persona-root");
    if (!host) return;

    let handle: ReturnType<typeof createAgentExperience> | null = createAgentExperience(host, {
      apiUrl,
      // The adapters emit Persona's SSE event vocabulary, which the widget
      // consumes natively (the same wire the Runtype API emits).
      launcher: { enabled: false },
      copy: {
        welcomeTitle: title,
        welcomeSubtitle: "Ask a question and the selected SDK stream will be wrapped for Persona.",
        inputPlaceholder: "Ask anything...",
      },
      theme: {
        semantic: {
          colors: {
            accent: "#157f8f",
            surface: "#ffffff",
            background: "#f7f8fb",
            primary: "#121826",
          },
        },
      },
      suggestionChips: [
        "Explain what this adapter does",
        "Write a haiku about streaming",
        "Give me a short checklist for production",
      ],
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });

    return () => {
      handle?.destroy();
      handle = null;
      host.replaceChildren();
    };
  }, [apiUrl, title]);

  return <div id="persona-root" />;
}
