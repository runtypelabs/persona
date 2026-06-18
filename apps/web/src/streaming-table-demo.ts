/**
 * Streaming Markdown Tables demo.
 *
 * Streams Markdown token-by-token into a message bubble so you can watch tables
 * render the way they do in the live widget: the table structure is completed as
 * soon as the first row arrives (`stabilizeStreamingTables`) and column widths
 * are locked while the stream is in flight (the `persona-content-streaming`
 * class → `table-layout: fixed`), so rows fill in without the header flipping
 * from a paragraph or the columns jiggling. Widths relax to their natural,
 * content-fit sizes once the stream completes.
 *
 * This uses the real widget pipeline: `createMarkdownProcessor` (marked), the
 * default DOMPurify sanitizer, idiomorph DOM morphing, and widget.css table
 * styles. Importing from "@runtypelabs/persona" registers marked/DOMPurify
 * synchronously (markdown-parsers-eager), so the processors are ready on load.
 */
import "@runtypelabs/persona/widget.css";
import "./index.css";

import { createMarkdownProcessor, createDefaultSanitizer } from "@runtypelabs/persona";
// Internal modules, reachable via the apps/web "@runtypelabs/persona" → src alias.
import { stabilizeStreamingTables } from "@runtypelabs/persona/utils/streaming-table";
import { morphMessages } from "@runtypelabs/persona/utils/morph";

const md = createMarkdownProcessor();
const sanitize = createDefaultSanitizer();

const render = (markdown: string): string => sanitize(md(markdown));

type Sample = { id: string; label: string; text: string };

const SAMPLES: Sample[] = [
  {
    id: "pricing",
    label: "Pricing comparison",
    text: `Here's how the three tiers compare:

| Plan | Price | Seats | Best for |
| --- | --- | --- | --- |
| Starter | $0/mo | 1 | Solo projects and trials |
| Team | $29/mo | 10 | Growing teams that need **collaboration** |
| Business | $99/mo | Unlimited | Companies with \`SSO\` and audit needs |

The Team plan is the most popular starting point.`,
  },
  {
    id: "uneven",
    label: "Wide / uneven columns",
    text: `A quick rundown of the API endpoints:

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /v1/messages | List messages, newest first, with cursor-based pagination |
| POST | /v1/messages | Create a message and stream the assistant reply over SSE |
| DELETE | /v1/messages/:id | Permanently remove a single message from the conversation |

All endpoints require a bearer token.`,
  },
  {
    id: "prose",
    label: "Prose around a table",
    text: `Sure — let me break down the quarterly results.

First, some context: revenue grew steadily while costs stayed flat.

| Quarter | Revenue | Growth |
| --- | --- | --- |
| Q1 | $1.2M | — |
| Q2 | $1.5M | +25% |
| Q3 | $2.1M | +40% |

As you can see, *Q3* was the standout quarter, and momentum is carrying into Q4.`,
  },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Cancellation: each replay invalidates the previous run's token.
let cancelToken = { cancelled: false };
const freshCancel = () => {
  cancelToken.cancelled = true;
  cancelToken = { cancelled: false };
  return cancelToken;
};

const content = document.getElementById("stream-content") as HTMLElement;
const sampleSelector = document.getElementById("sample-selector") as HTMLElement;
const speedSlider = document.getElementById("speed") as HTMLInputElement;
const speedLabel = document.getElementById("speed-label") as HTMLElement;
const playBtn = document.getElementById("btn-play") as HTMLButtonElement;

// Reusable detached node that idiomorph diffs the live bubble against.
const scratch = document.createElement("div");

const paint = (acc: string, streaming: boolean) => {
  // While streaming, lock column widths (relaxes to natural widths on the final
  // paint) and stabilize the table-in-progress so it renders from the first row.
  content.classList.toggle("persona-content-streaming", streaming);
  scratch.innerHTML = render(streaming ? stabilizeStreamingTables(acc) : acc);
  morphMessages(content, scratch, { preserveTypingAnimation: false });
};

let activeSampleId = SAMPLES[0].id;

const currentSample = (): Sample =>
  SAMPLES.find((s) => s.id === activeSampleId) ?? SAMPLES[0];

const replay = async () => {
  const token = freshCancel();
  playBtn.disabled = true;

  const { text } = currentSample();
  const speed = parseInt(speedSlider.value, 10);
  const step = 3; // characters revealed per tick — mimics chunky token streaming

  paint("", true);
  await sleep(150);

  for (let i = step; i < text.length; i += step) {
    if (token.cancelled) {
      playBtn.disabled = false;
      return;
    }
    paint(text.slice(0, i), true);
    await sleep(speed);
  }

  if (token.cancelled) {
    playBtn.disabled = false;
    return;
  }

  // Final paint: streaming=false drops the fixed-layout class, relaxing the
  // finished table to natural content-fit widths.
  paint(text, false);
  playBtn.disabled = false;
};

// --- Controls -------------------------------------------------------------

SAMPLES.forEach((sample, idx) => {
  const btn = document.createElement("button");
  btn.className = `mode-btn${idx === 0 ? " active" : ""}`;
  btn.dataset.sample = sample.id;
  btn.textContent = sample.label;
  sampleSelector.appendChild(btn);
});

sampleSelector.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".mode-btn");
  if (!btn) return;
  sampleSelector.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  activeSampleId = btn.dataset.sample ?? SAMPLES[0].id;
  void replay();
});

speedSlider.addEventListener("input", () => {
  speedLabel.textContent = `${speedSlider.value}ms`;
});

playBtn.addEventListener("click", () => void replay());

// Boot with the first sample streamed once.
void replay();
