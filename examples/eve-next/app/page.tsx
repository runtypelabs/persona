import { PersonaWidget } from "./components/persona-widget";

export default function Page() {
  return (
    <main>
      <div className="shell">
        <section className="intro" aria-label="Example notes">
          <span className="badge">Framework · eve (Vercel)</span>
          <h1>Persona × eve</h1>
          <p>
            The Persona widget runs in proxy mode against a local route that streams an{" "}
            <a href="https://github.com/vercel/eve">eve</a> agent session and translates each{" "}
            <code>message.appended</code> delta into Persona&apos;s SSE
            wire.
          </p>
          <p>
            Active backend: <code>/api/eve/dispatch</code>
          </p>
          <p>
            The eve agent lives in <code>./agent</code> and auto-starts with the dev server via{" "}
            <code>withEve()</code> in <code>next.config.mjs</code>, so there&apos;s no separate
            server to run. Set <code>AI_GATEWAY_API_KEY</code> for real responses. The session
            stream is injected, so the validation test runs without any of it.
          </p>
        </section>

        <section className="widgetHost" aria-label="eve widget">
          <PersonaWidget
            apiUrl="/api/eve/dispatch"
            title="eve"
            subtitle="Ask a question and the eve agent's session stream will be wrapped for Persona."
            accent="#0a0a0a"
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
