/**
 * The demo page. Mounts the real Persona widget from a plain `<script>` tag,
 * no bundler. The widget's IIFE build attaches the public API to
 * `window.AgentWidgetBrowser`; Express serves it from the local workspace build
 * (see `index.ts`) so the page works fully offline.
 */
export const PAGE = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Persona × Express</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
        background: #f7f8fb;
        color: #121826;
      }
      .shell { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
      .badge {
        display: inline-block; font-size: 12px; letter-spacing: 0.04em;
        text-transform: uppercase; color: #157f8f; font-weight: 600;
      }
      h1 { margin: 8px 0 4px; font-size: 28px; }
      p { color: #475067; }
      code { background: #eceef3; padding: 1px 6px; border-radius: 5px; font-size: 14px; }
      .widget-host {
        margin-top: 28px; height: 520px; border: 1px solid #e3e6ee;
        border-radius: 14px; overflow: hidden; background: #fff;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <span class="badge">Host · Express</span>
      <h1>Persona × Express</h1>
      <p>
        The same canonical adapter, bridged from Express's <code>(req, res)</code> callback style:
        build a Web <code>Request</code>, call the handler, and
        <code>Readable.fromWeb(webRes.body).pipe(res)</code>. The
        <code>persona-wire.ts</code> file is byte-identical to every other host in the matrix.
      </p>
      <p>Active backend: <code>POST /dispatch</code> (zero-dependency echo agent)</p>
      <div id="persona-root" class="widget-host"></div>
    </div>

    <script src="/persona/index.global.js"></script>
    <script>
      const { createAgentExperience, markdownPostprocessor } = window.AgentWidgetBrowser;
      createAgentExperience(document.getElementById("persona-root"), {
        apiUrl: "/dispatch",
        launcher: { enabled: false },
        copy: {
          welcomeTitle: "Persona × Express",
          welcomeSubtitle: "Ask anything. The echo agent streams it back over the Persona wire.",
          inputPlaceholder: "Ask anything...",
        },
        theme: {
          semantic: {
            colors: {
              accent: "#047857",
              surface: "#ffffff",
              background: "#f7f8fb",
              primary: "#121826",
            },
          },
        },
        suggestionChips: [
          "Echo this back to me",
          "Why does Express need a bridge?",
          "Explain the Persona wire",
        ],
        postprocessMessage: ({ text }) => markdownPostprocessor(text),
      });
    </script>
  </body>
</html>`;
