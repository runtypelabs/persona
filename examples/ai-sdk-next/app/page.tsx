"use client";

import { useState } from "react";
import { PersonaWidget } from "./components/persona-widget";

const endpoints = {
  aiSdk: {
    label: "Vercel AI SDK",
    apiUrl: "/api/ai-sdk/dispatch",
    description:
      "Wraps streamText().fullStream and translates text-delta events into Persona SSE.",
  },
  openai: {
    label: "OpenAI Responses",
    apiUrl: "/api/openai-responses/dispatch",
    description:
      "Wraps openai.responses.create({ stream: true }) and translates Responses events into Persona SSE.",
  },
} as const;

type EndpointKey = keyof typeof endpoints;

export default function Page() {
  const [active, setActive] = useState<EndpointKey>("aiSdk");
  const endpoint = endpoints[active];

  return (
    <main>
      <div className="shell">
        <section className="intro" aria-label="Example notes">
          <h1>Persona SDK adapters</h1>
          <p>
            This standalone example shows how to plug existing SDK streams into
            Persona without hand-emitting every SSE frame in each route.
          </p>
          <p>
            Active backend: <code>{endpoint.apiUrl}</code>
          </p>
          <p>{endpoint.description}</p>
          <div className="tabs" role="tablist" aria-label="Backend adapter">
            {(Object.keys(endpoints) as EndpointKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                data-active={active === key}
                aria-selected={active === key}
                onClick={() => setActive(key)}
              >
                {endpoints[key].label}
              </button>
            ))}
          </div>
        </section>

        <section className="widgetHost" aria-label={`${endpoint.label} widget`}>
          <PersonaWidget key={active} apiUrl={endpoint.apiUrl} title={endpoint.label} />
        </section>
      </div>
    </main>
  );
}
