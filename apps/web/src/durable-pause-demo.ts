import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
} from "@runtypelabs/persona";
import {
  createMockSSEResponse,
  type MockSSEFrame,
} from "@runtypelabs/persona/testing";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "durable-pause-demo" });

const configInspector = createDemoConfigInspector({ title: "Durable Pause" });
let mountMode: Mode = "inline";

// Which durable-pause kind the mock stream emits. Both are auto-resuming server
// pauses (the SERVER resumes the stream), so neither shows a resume affordance —
// only the passive indicator copy differs. `awaitReason` is UX context only,
// never a control signal.
type PauseKind = "crawl_pending" | "durable_poll";
let pauseKind: PauseKind = "crawl_pending";

// One assistant turn: turn_start → text_start → text_delta(s) → text_complete →
// turn_complete. Mirrors the approval demo's helper; `text_complete` seals the
// bubble so the durable-pause bubble (and the resumed answer) render below it.
const assistantTurn = (
  executionId: string,
  turnId: string,
  iteration: number,
  deltas: string[],
): MockSSEFrame[] => {
  const blockId = `${turnId}-text`;
  return [
    { type: "turn_start", executionId, id: turnId, iteration },
    { type: "text_start", executionId, id: blockId },
    ...deltas.map((delta) => ({ type: "text_delta", executionId, id: blockId, delta })),
    { type: "text_complete", executionId, id: blockId },
    { type: "turn_complete", executionId, id: turnId },
  ];
};

// The scripted durable-pause stream. The widget renders a passive "working in
// the background" indicator on the `await` frame (because `awaitReason` is
// present and there are no tool fields), holds it through the keep-alive pings,
// then settles it the moment the resumed assistant text begins — all on the
// SAME stream, exactly as CrawlPollerDO / the wait-until Workflow drive it
// server-side. No resume button ever appears; the client just waits for frames.
const buildPauseStream = (): MockSSEFrame[] => {
  const executionId = "exec-durable-1";
  const crawl = pauseKind === "crawl_pending";
  const pauseFrame: MockSSEFrame = crawl
    ? {
        type: "await",
        executionId,
        awaitReason: "crawl_pending",
        crawlId: "crawl_a1b2c3",
        stepId: "step-research",
      }
    : {
        type: "await",
        executionId,
        awaitReason: "durable_poll",
        stepId: "step-wait-until",
      };

  const intro = crawl
    ? "Sure — let me crawl acme.com and pull the latest positioning signals."
    : "On it — I'll wait for the upstream job to finish, then summarize.";
  const answer = crawl
    ? [
        "Done — I read across the site. Here's what stands out:\n\n",
        "1. **Positioning** — leads with reliability and time-to-value.\n",
        "2. **Audience** — mid-market ops teams, not enterprise IT.\n",
        "3. **Proof** — case studies emphasize migration speed.\n",
      ]
    : [
        "The background job finished. Summary:\n\n",
        "- **Status:** completed successfully\n",
        "- **Records processed:** 12,480\n",
        "- **Next step:** results are ready to export.\n",
      ];

  return [
    { type: "execution_start", kind: "agent", executionId, agentId: "demo-agent", agentName: "Research Agent", maxTurns: 3, startedAt: Date.now() },
    ...assistantTurn(executionId, "turn-1", 1, [intro]),
    // Enter the auto-resuming durable pause.
    pauseFrame,
    // Keep-alive heartbeats while the server works (these must NOT settle the
    // passive indicator — they keep the stream open during the pause).
    { type: "ping" },
    { type: "ping" },
    { type: "ping" },
    { type: "ping" },
    // Server resumes the SAME stream with the answer — the indicator settles
    // (and hides) as the first resumed frame arrives.
    ...assistantTurn(executionId, "turn-2", 2, answer),
    { type: "execution_complete", kind: "agent", executionId, success: true, stopReason: "complete" },
  ];
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const launcherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    // Ephemeral: canned mock (every send replays the same scripted stream), so
    // persisting only leaves stale bubbles on reload. Matches approval-demo.
    persistState: false,
    customFetch: async () =>
      // Slow-ish cadence so the passive pause indicator is clearly visible
      // before the stream resumes.
      createMockSSEResponse(buildPauseStream(), { delayMs: 450 }),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: launcherChrome,
      width: launcherChrome ? "min(420px, 95vw)" : "100%",
      title: launcherChrome ? "Durable Pause" : undefined,
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: "#0f172a",
      accent: "#2563eb",
      surface: "#f8fafc",
      muted: "#64748b",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Durable Pause Demo",
      welcomeSubtitle:
        "Send any message to trigger an auto-resuming durable pause. The widget shows a passive 'working in the background' indicator — never a resume button — and continues on its own when the stream resumes.",
      inputPlaceholder: "Send a message to trigger a durable pause...",
    },
    features: { showToolCalls: true, showReasoning: true },
    suggestionChips:
      pauseKind === "crawl_pending"
        ? ["Crawl acme.com", "Summarize their positioning"]
        : ["Run the nightly export", "Wait for the job"],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

let activeStage: HTMLElement | null = null;
let teardownActive: (() => void) | null = null;

const createWidget = (): void => {
  if (teardownActive) {
    teardownActive();
    teardownActive = null;
  }
  const stage = activeStage;
  if (!stage) return;
  const { teardown } = runWidgetMountWithInspector(
    configInspector,
    mountMode,
    stage,
    buildConfig,
  );
  teardownActive = teardown;
};

setupMountMode({
  slug: "durable-pause-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    mountMode = mode;
    activeStage = stage;
    createWidget();
    return () => {
      if (teardownActive) {
        teardownActive();
        teardownActive = null;
      }
    };
  },
});

// Durable-pause kind selector (crawl_pending vs durable_poll) — switches the
// scripted `awaitReason` and the passive indicator copy.
const kindSelector = document.getElementById("kind-selector");
kindSelector?.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLElement>(".mode-btn");
  if (!btn) return;
  const next = btn.dataset.kind as PauseKind | undefined;
  if (!next || next === pauseKind) return;
  kindSelector.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  pauseKind = next;
  createWidget();
});
