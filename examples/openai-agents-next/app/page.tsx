import { PersonaWidget } from "./components/persona-widget";

export default function Page() {
  return (
    <main>
      <div className="shell">
        <section className="intro" aria-label="Example notes">
          <span className="badge">Agent SDK · @openai/agents</span>
          <h1>Persona × OpenAI Agents SDK</h1>
          <p>
            The Persona widget runs in proxy mode against a local route that runs an{" "}
            <code>Agent</code> with <code>run(agent, input, &#123; stream: true &#125;)</code> and
            translates each <code>output_text_delta</code> event into Persona&apos;s neutral{" "}
            wire.
          </p>
          <p>
            Active backend: <code>/api/openai-agents/dispatch</code>
          </p>
          <p>
            The adapter lives in <code>app/lib/openai-agents-adapter.ts</code>; the route builds the{" "}
            <code>Agent</code> and the validation test swaps in a mock model via{" "}
            <code>aisdk()</code>.
          </p>
        </section>

        <section className="widgetHost" aria-label="OpenAI Agents widget">
          <PersonaWidget
            apiUrl="/api/openai-agents/dispatch"
            title="OpenAI Agents SDK"
            subtitle="Ask a question and the agent run's stream will be wrapped for Persona."
            accent="#10a37f"
            suggestionChips={[
              "Explain what this adapter does",
              "Write a haiku about streaming",
              "Give me a short checklist for production",
            ]}
          />
        </section>
      </div>
    </main>
  );
}
