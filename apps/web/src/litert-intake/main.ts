// On-device Intake: an auto-insurance First Notice of Loss (claim) form that
// fills itself from natural language, powered by Gemma 4 running ENTIRELY in the
// browser via LiteRT-LM over WebGPU — no server, no API key, no data leaving the
// page. The user tells the docked Persona panel what happened in plain words; the
// model extracts values and fills the page's form through ONE batched WebMCP
// write tool. Fields light up as they land.
//
// This is the "small-model recipe" for extraction: a rambling narrative in, a
// single structured set_fields call out. The engine (../litert-shared/litert-engine)
// is reused verbatim — the only page-specific pieces are the form, the three
// tools, the system prompt, and this wiring.
import "@runtypelabs/persona/widget.css";
// litert-chrome.css supplies the shared toolbar + eval-HUD styles (`.lr-*`).
import "../litert-shared/litert-chrome.css";
import "./intake.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
// The WebMCP polyfill must be initialized before any tool registers.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { FIELD_CATALOG, IntakeForm, renderIntakeForm } from "./form";
import { APPROVAL_REQUIRED_TOOL_NAMES, setupIntakeTools } from "./tools";
import { createEvalHud } from "../litert-shared/eval-hud";
import {
  type LiteRtPersonaEngine,
  createLiteRtPersonaEngine,
} from "../litert-shared/litert-engine";
import { wireModelLoader } from "../litert-shared/model-loader";

initializeWebMCPPolyfill();

// Fake dispatch URL: the engine patches window.fetch to answer this path (and
// `${API_PATH}/resume`) from the in-browser model. Kept off `/api/...` so the
// Vite dev proxy never tries to forward it.
const API_PATH = "/litert/intake/dispatch";
const MODEL_NOT_READY_CHAT_ERROR =
  "The on-device model isn't ready yet. Pick a model in the toolbar, press Load model, and wait for the ready status before telling me what happened.";

// A realistic, rambling 4-sentence narrative — the "paste a sample story"
// payload. It states nearly every field (and a relative date, "last Tuesday",
// so the model has to resolve it against today), which makes the extraction
// visibly land across the whole form.
const SAMPLE_STORY =
  "Hi, this is Marcus Bell — my policy number is AZ-4491028 and you can reach me at (602) 555-0147 or marcus.bell@example.com. Last Tuesday around 6:30 in the evening I was backing my 2022 Honda Civic (plate 8XYZ123) out of a spot at the Safeway lot on 5th and Main when another driver clipped my rear bumper. The other driver was Dana Ruiz in a blue Ford F-150, and she's insured with Geico. Nobody was hurt and we didn't file a police report.";

const formRoot = document.querySelector<HTMLElement>("#intake-form-root");
const dockTarget = document.querySelector<HTMLElement>("#intake-dock-target");
if (!formRoot || !dockTarget) {
  throw new Error("[LiteRT Intake] Missing mount points in litert-intake.html");
}

// ---- Form store + renderer + tools -----------------------------------------

const form = new IntakeForm();
renderIntakeForm(formRoot, form);
// No async bridge here (unlike litert-paint's jspaint) — the form store is ready
// synchronously, so the tools can register immediately after the polyfill init.
setupIntakeTools(form);

// Include the weekday: a small model resolving "last Tuesday" needs the anchor
// ("2026-07-02 (Thursday)"), not just the ISO date — observed off-by-one without it.
const localToday = (): string => {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} (${weekday})`;
};

// ---- On-device engine + eval HUD -------------------------------------------

const hudMount = document.querySelector<HTMLElement>("#lr-hud");
const hud = hudMount ? createEvalHud(hudMount) : { onMetric: () => {} };

// Short, imperative, extraction-focused — sized for a 2B/4B model that re-reads
// it every turn. The hard rules: fill only via set_fields with exact ids, never
// invent a value, normalize dates/times, batch into ONE call, then ask for the
// missing required fields in a single question.
const SYSTEM_PROMPT = `You are an intake assistant for an auto-insurance First Notice of Loss (claim) form. You help the user file a claim by pulling details out of what they tell you and filling the form for them.

Fill the form ONLY by calling set_fields with the exact field ids listed in the form state below. Extract ONLY values the user actually stated — NEVER invent, guess, or assume a value. Copy names, phone numbers, emails, policy numbers, and license plates verbatim. If a field wasn't mentioned, leave it out entirely.

Before calling set_fields, go through EVERY field id in the form state ONE BY ONE and check whether the user's message states a value for it — people pack many details into one message (a phone number, a plate, the other driver, whether anyone was hurt). Capture ALL of them; a "no" or "nobody" is a value too (false). When the user tells the story of the incident, also write a 1-2 sentence version of it into the description field. Include ONLY fields with NEW information — do not re-send values that are already in the form state.

Normalize before writing: resolve dates to YYYY-MM-DD using the "today" value in the form state (so "last Tuesday" becomes an absolute date); write times as 24-hour HH:MM; write phone numbers as digits and dashes, like 602-555-0147.

Batch EVERYTHING you extracted into ONE set_fields call — never one call per field. After the tool returns, reply with ONE short sentence saying what you filled, then ask for the most important still-missing required fields in a SINGLE question (list at most three).

When every required field is present, ask the user to confirm the details are correct; only after they confirm, call submit_claim. Use reset_form only if the user asks to start over. Never call the same tool twice with the same arguments.`;

const engine = createLiteRtPersonaEngine({
  apiPath: API_PATH,
  onMetric: hud.onMetric,
  // Single consolidated system turn: instructions + the live form state the
  // widget rode along (see contextProviders below), so the model always sees the
  // catalog, current values, and what's still missing without a round trip.
  buildSystemContent: (ctx) => {
    const intake = ctx.intake_context;
    return typeof intake === "string" && intake
      ? `${SYSTEM_PROMPT}\n\nForm state (JSON):\n${intake}`
      : SYSTEM_PROMPT;
  },
  toolScope: "core",
  coreToolNames: ["set_fields", "reset_form", "submit_claim"],
});
window.personaLiteRtEngine = engine;

// ---- Model picker (same ids/pattern as litert-paint) -----------------------

// E4B is the default HERE (unlike the other litert demos): extraction quality
// is the demo. Live-tested — E2B misses ~half the facts in a long narrative
// and will NOT emit sentence-length strings in tool args (the `description`
// field failed 5/5 on E2B), while E4B filled 9/10 required fields in one pass
// and resolved "last Tuesday" correctly. E2B stays in the picker for
// comparison; the conversational repair loop still converges on it.
wireModelLoader({
  engine,
  readyHint: "tell me what happened.",
  defaultModel: "e4b",
});

// ---- Persona widget --------------------------------------------------------

let widget: ReturnType<typeof initAgentWidget> | null = null;

function mountWidget(): void {
  widget = initAgentWidget({
    target: dockTarget as HTMLElement,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl: API_PATH,
      // Early dispatch guard (same as litert-paint): fail fast with a helpful
      // message if the user chats before Gemma is loaded.
      customFetch: async (url, init) => {
        if (!engine.isLoaded()) throw new Error(MODEL_NOT_READY_CHAT_ERROR);
        return fetch(url, init);
      },
      errorMessage: (error) =>
        error.message === MODEL_NOT_READY_CHAT_ERROR
          ? MODEL_NOT_READY_CHAT_ERROR
          : `Sorry — the on-device intake assistant hit an error.\n\n_Details: ${error.message}_`,
      // Rewrite the "Use a sample story" suggestion chip into the full narrative
      // on its way out, so the chip actually feeds the model something to extract
      // (the page button does the same via submitMessage). The user's bubble
      // still reads "Use a sample story"; the model receives the story.
      requestMiddleware: ({ payload }) => {
        const messages = payload.messages;
        const last = messages[messages.length - 1];
        if (
          last &&
          last.role === "user" &&
          typeof last.content === "string" &&
          last.content.trim() === "Use a sample story"
        ) {
          return {
            ...payload,
            messages: [...messages.slice(0, -1), { ...last, content: SAMPLE_STORY }],
          };
        }
      },
      storageAdapter: createLocalStorageAdapter("persona-state-litert-intake"),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: "light",
      // Square the panel's outer edges (no radius, border, or shadow) so the
      // docked assistant sits flush against the toolbar and viewport edge like
      // a built-in pane — the Switchback storefront's treatment. Everything
      // else stays on the default theme.
      theme: {
        components: {
          panel: { borderRadius: "0", border: "none", shadow: "none" },
          header: { borderRadius: "0" },
        },
      },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Tell me what happened",
        welcomeSubtitle:
          "Describe your accident in plain words and I'll fill the claim form for you — right here in your browser. Nothing you type ever leaves this page. Load a model from the toolbar to begin.",
        inputPlaceholder: "Describe what happened…",
      },
      suggestionChips: ["Use a sample story", "What's still missing?", "Reset the form"],
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: "docked",
        dock: {
          side: "right",
          width: "420px",
          reveal: "emerge",
          animate: true,
        },
        autoExpand: true,
        mobileBreakpoint: 1080,
        title: "Claim Intake",
        subtitle: "Gemma 4 · on-device",
        headerIconName: "shield-check",
      },
      webmcp: {
        enabled: true,
        // The batched set_fields auto-approves so the form fills live; only the
        // destructive/terminal tools (reset_form, submit_claim) confirm.
        autoApprove: (info) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
      },
      // Fresh form state rides along with every message; the engine folds
      // `intake_context` into the system turn. `today` is essential so the model
      // can resolve relative dates. The catalog is serialized compactly (the tool
      // schema carries the long per-field descriptions, not this).
      contextProviders: [
        () => ({
          intake_context: JSON.stringify({
            today: localToday(),
            fields: FIELD_CATALOG.map((f) => ({
              id: f.id,
              label: f.label,
              type: f.type,
              ...(f.enum ? { enum: [...f.enum] } : {}),
              required: f.required,
            })),
            values: form.snapshotValues(),
            missingRequired: form.missingRequired(),
          }),
        }),
      ],
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: "Run form action?",
        approveLabel: "Run",
        denyLabel: "Cancel",
        detailsDisplay: "collapsed",
      },
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: "Gemma 4 runs entirely on-device — your claim details never leave this page.",
        connectedText: "Gemma 4 is reading your story on-device…",
        connectingText: "Spinning up Gemma 4…",
        errorText: "On-device engine error",
      },
    },
  });
  window.personaIntakeWidget = widget;
}

// Mount the Persona panel IMMEDIATELY — never gate it on anything. The
// model-not-ready guard fronts the first turn if the user chats before loading.
mountWidget();

// "Paste a sample story": submit the full narrative as a user message (shows the
// rambling input in the thread, then the form fills as the model extracts). This
// uses the widget's programmatic submitMessage — the cleanest supported call,
// and it auto-opens the panel if closed.
const sampleBtn = document.querySelector<HTMLButtonElement>("#intake-sample-btn");
sampleBtn?.addEventListener("click", () => {
  widget?.submitMessage(SAMPLE_STORY);
});

declare global {
  interface Window {
    personaIntakeWidget?: ReturnType<typeof initAgentWidget>;
    personaLiteRtEngine?: LiteRtPersonaEngine;
  }
}
