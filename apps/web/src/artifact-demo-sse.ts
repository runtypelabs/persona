/**
 * Mock SSE frames for the artifact showcase demo.
 *
 * The toolbar buttons replay the EXACT wire frames a real Runtype agent emits
 * when it produces an artifact, so the demo exercises the production streaming
 * pipeline instead of the programmatic `upsertArtifact()` shortcut. That means
 * the in-chat `PersonaArtifactCard` reference card appears (Generating… → done
 * with a Download button), the streaming status dot animates, and the side pane
 * fills from the same `artifact_delta` chunks: the true end-user UX.
 *
 * Each turn is wrapped in Persona's unified SSE envelope
 * (`execution_start` → `turn_start` → `text_*` → `artifact_*` → `turn_complete`
 * → `execution_complete`), the same vocabulary documented in `demo-echo-fetch.ts`.
 * The text frames stream a short assistant intro (so the turn reads like a real
 * reply), then the artifact frames stream the payload. This mirrors the
 * fullscreen-assistant demo's `pushArtifactOnlyFrames` pattern, extended with a
 * scripted intro and the full execution envelope.
 */

import { createMockSSEStream, type MockSSEFrame } from "@runtypelabs/persona/testing";

export type ArtifactDemoButton = "md" | "html-file" | "react-file" | "comp" | "unknown";

/** File metadata carried on `artifact_start` for previewable file artifacts. */
interface ArtifactFileMeta {
  path: string;
  mimeType: string;
  language: string;
}

/** Markdown sample streamed via `artifact_delta` chunks. */
const MARKDOWN_SAMPLE =
  "## Hello\n\nThis **markdown** artifact streamed frame by frame from the demo toolbar, the same way a real agent emits it.";

// Previewable HTML file artifact (as a Claude Managed agent would emit one): the
// content is a fenced code block on the wire, and `file` metadata lets Persona
// unfence and preview it in a sandboxed iframe. Exercise the rendered/source
// toggle and Download from the card and pane.
const CAT_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Cat</title></head>
  <body style="font-family: system-ui, sans-serif; text-align: center; padding: 2rem;">
    <h1>Hello from an HTML file artifact</h1>
    <p>This file streamed as a fenced code block, then rendered in a sandboxed iframe.</p>
    <button onclick="this.textContent = 'Meow!'">Click me</button>
  </body>
</html>
`;

// Same wire shape, but the HTML file is a self-contained React app: React +
// ReactDOM UMD and Babel standalone from a CDN, JSX in an inline script. This is
// what agents typically write for single-file React outputs. The sandbox is
// `allow-scripts` so the CDN scripts load and run; note that `srcdoc` inherits
// the host page's CSP, so a strict host CSP can block the CDN loads.
const REACT_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>React Counter</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
      body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; }
      button { font-size: 1.25rem; padding: 0.5rem 1.25rem; border-radius: 0.5rem; border: 1px solid #ccc; cursor: pointer; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      function Counter() {
        const [count, setCount] = React.useState(0);
        return (
          <div>
            <h1>React file artifact</h1>
            <p>This React app streamed as a fenced code block, then ran in a sandboxed iframe.</p>
            <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
          </div>
        );
      }
      ReactDOM.createRoot(document.getElementById("root")).render(<Counter />);
    </script>
  </body>
</html>
`;

// Encode the way core does: escape any literal triple-backtick (backtick + ZWSP
// + backtick backtick), then wrap in a fence.
const ZWSP = "\u200b";
const encodeFileArtifact = (source: string, lang: string): string => {
  const escaped = source.split("```").join("`" + ZWSP + "``");
  return "```" + lang + "\n" + escaped + "\n```";
};

/** Split text into `size`-char chunks so the streaming state is visible. */
function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

type MarkdownSpec = {
  kind: "markdown";
  intro: string;
  title: string;
  content: string;
  file?: ArtifactFileMeta;
};

type ComponentSpec = {
  kind: "component";
  intro: string;
  title: string;
  component: string;
  props: Record<string, unknown>;
};

type ArtifactSpec = MarkdownSpec | ComponentSpec;

/** Resolve the scripted spec for a toolbar button. */
function specFor(button: ArtifactDemoButton): ArtifactSpec {
  switch (button) {
    case "md":
      return {
        kind: "markdown",
        intro: "Here's a short markdown note, rendering live in the side pane.",
        title: "Sample",
        content: MARKDOWN_SAMPLE,
      };
    case "html-file":
      return {
        kind: "markdown",
        intro: "Here's `outputs/cat.html`, rendered in the sandboxed preview.",
        title: "outputs/cat.html",
        content: encodeFileArtifact(CAT_HTML, "html"),
        file: { path: "outputs/cat.html", mimeType: "text/html", language: "html" },
      };
    case "react-file":
      return {
        kind: "markdown",
        intro: "Here's `outputs/counter-react.html`, a self-contained React app in the sandboxed preview.",
        title: "outputs/counter-react.html",
        content: encodeFileArtifact(REACT_HTML, "html"),
        file: { path: "outputs/counter-react.html", mimeType: "text/html", language: "html" },
      };
    case "comp":
      return {
        kind: "component",
        intro: "Here's a registered component artifact, mounted in the side pane.",
        title: "Pill",
        component: "ArtifactDemoPill",
        props: { label: "Registered component" },
      };
    case "unknown":
      return {
        kind: "component",
        intro: "Here's a component the registry doesn't know, so the pane shows its fallback inspector card.",
        title: "Missing registry entry",
        component: "TotallyUnknownWidget",
        props: { foo: "bar" },
      };
  }
}

/**
 * Build a scripted mock SSE stream for a toolbar button. `seq` makes the
 * execution and artifact ids unique per click, so repeated clicks create
 * separate reference cards instead of updating one.
 */
export function createArtifactDemoStream(
  button: ArtifactDemoButton,
  seq: number,
  delayMs = 28
): ReadableStream<Uint8Array> {
  const spec = specFor(button);
  const executionId = `artifact-demo-${seq}`;
  const turnId = `${executionId}-turn-1`;
  const textBlockId = `${executionId}-text`;
  const artifactId = `${executionId}-artifact`;

  const frames: MockSSEFrame[] = [
    {
      type: "execution_start",
      kind: "agent",
      executionId,
      agentId: "artifact-demo",
      agentName: "Artifact Demo",
      maxTurns: 1,
      startedAt: Date.now(),
    },
    { type: "turn_start", executionId, id: turnId, iteration: 1 },
    { type: "text_start", executionId, id: textBlockId },
  ];

  // Stream the assistant intro so the turn reads like a real reply.
  for (const delta of chunkText(spec.intro, 6)) {
    frames.push({ type: "text_delta", executionId, id: textBlockId, delta });
  }
  frames.push({ type: "text_complete", executionId, id: textBlockId });

  // Artifact frames: this is what makes the in-chat reference card appear.
  if (spec.kind === "markdown") {
    frames.push({
      type: "artifact_start",
      id: artifactId,
      artifactType: "markdown",
      title: spec.title,
      ...(spec.file ? { file: spec.file } : {}),
    });
    for (const delta of chunkText(spec.content, 64)) {
      frames.push({ type: "artifact_delta", id: artifactId, delta });
    }
    frames.push({ type: "artifact_complete", id: artifactId });
  } else {
    // Component artifacts carry their props on `artifact_update` (start opens the
    // card with empty props; update fills them), then `artifact_complete` seals it.
    frames.push({
      type: "artifact_start",
      id: artifactId,
      artifactType: "component",
      title: spec.title,
      component: spec.component,
    });
    frames.push({
      type: "artifact_update",
      id: artifactId,
      component: spec.component,
      props: spec.props,
    });
    frames.push({ type: "artifact_complete", id: artifactId });
  }

  frames.push({ type: "turn_complete", executionId, id: turnId, stopReason: "complete" });
  frames.push({
    type: "execution_complete",
    kind: "agent",
    executionId,
    success: true,
    stopReason: "complete",
  });

  return createMockSSEStream(frames, { delayMs, eventName: "message" });
}
