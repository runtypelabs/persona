"use client";

import { useEffect, useState } from "react";
import {
  createAgentExperience,
  markdownPostprocessor,
} from "@runtypelabs/persona";

type PersonaWidgetProps = {
  apiUrl: string;
  title: string;
  subtitle: string;
  accent?: string;
  starterItems?: string[];
  turnActivity?: boolean;
};

export function PersonaWidget({
  apiUrl,
  title,
  subtitle,
  accent = "#157f8f",
  starterItems,
  turnActivity = false,
}: PersonaWidgetProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = document.getElementById("persona-root");
    if (!host) return;

    let handle: ReturnType<typeof createAgentExperience> | null = createAgentExperience(host, {
      apiUrl,
      turnActivity: { enabled: turnActivity },
      // The adapters emit Persona's SSE event vocabulary, which the widget
      // consumes natively (the same wire the Runtype API emits).
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

    const clearError = handle.on("run:started", () => setError(null));
    const showError = handle.on("run:finished", ({ outcome }) => {
      if (outcome === "error") {
        setError("The provider could not complete this request. Check the server credentials, account credits, and selected model, then try again.");
      }
    });

    return () => {
      clearError();
      showError();
      handle?.destroy();
      handle = null;
      host.replaceChildren();
    };
  }, [apiUrl, title, subtitle, accent, starterItems, turnActivity]);

  return (
    <>
      {error && <p className="providerError" role="alert">{error}</p>}
      <div id="persona-root" />
    </>
  );
}
