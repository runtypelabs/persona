<script lang="ts">
  import { onMount } from "svelte";
  import { createAgentExperience, markdownPostprocessor } from "@runtypelabs/persona";

  let host: HTMLDivElement;

  onMount(() => {
    const handle = createAgentExperience(host, {
      apiUrl: "/api/dispatch",
      launcher: { enabled: false },
      copy: {
        welcomeTitle: "Persona × SvelteKit",
        welcomeSubtitle: "Ask anything. The echo agent streams it back over the Persona wire.",
        inputPlaceholder: "Ask anything...",
      },
      theme: {
        semantic: {
          colors: {
            accent: "#ff3e00",
            surface: "#ffffff",
            background: "#f7f8fb",
            primary: "#121826",
          },
        },
      },
      suggestionChips: [
        "Echo this back to me",
        "How does the +server.ts route work?",
        "Explain the Persona wire",
      ],
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });

    return () => handle?.destroy();
  });
</script>

<main>
  <div class="shell">
    <span class="badge">Host · SvelteKit</span>
    <h1>Persona × SvelteKit</h1>
    <p>
      The same canonical adapter, mounted in a SvelteKit
      <code>+server.ts</code> route. SvelteKit speaks Web
      <code>Request</code>/<code>Response</code>, so the route is one line:
      <code>export const POST = (event) =&gt; dispatch(event.request)</code>. The
      <code>persona-wire.ts</code> file is byte-identical to every other host in the matrix.
    </p>
    <p>Active backend: <code>POST /api/dispatch</code> (zero-dependency echo agent)</p>
    <div bind:this={host} class="widget-host"></div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: #f7f8fb;
    color: #121826;
  }
  .shell {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 20px;
  }
  .badge {
    display: inline-block;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #157f8f;
    font-weight: 600;
  }
  h1 {
    margin: 8px 0 4px;
    font-size: 28px;
  }
  p {
    color: #475067;
  }
  code {
    background: #eceef3;
    padding: 1px 6px;
    border-radius: 5px;
    font-size: 14px;
  }
  .widget-host {
    margin-top: 28px;
    height: 520px;
    border: 1px solid #e3e6ee;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
  }
</style>
