import { PersonaWidget } from "./components/persona-widget";

export default function Page() {
  return (
    <main>
      <div className="shell">
        <section className="intro" aria-label="Example notes">
          <span className="badge">Framework · @langchain/langgraph</span>
          <h1>Persona × LangGraph.js</h1>
          <p>
            The Persona widget runs in proxy mode against a local route that streams a minimal{" "}
            <code>StateGraph</code> with <code>graph.streamEvents(input, &#123; version: &quot;v2&quot; &#125;)</code>{" "}
            and translates each <code>on_chat_model_stream</code> token into Persona&apos;s neutral{" "}
            wire.
          </p>
          <p>
            Active backend: <code>/api/langgraph/dispatch</code>
          </p>
          <p>
            The adapter lives in <code>app/lib/langgraph-adapter.ts</code>; the chat model is
            injected, so the validation test swaps in a <code>FakeStreamingChatModel</code>.
          </p>
        </section>

        <section className="widgetHost" aria-label="LangGraph widget">
          <PersonaWidget
            apiUrl="/api/langgraph/dispatch"
            title="LangGraph.js"
            subtitle="Ask a question and the graph's token stream will be wrapped for Persona."
            accent="#1c3c3c"
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
