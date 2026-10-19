import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  initAgentWidget,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type VoiceMetrics,
} from "@runtypelabs/persona";
import { setupMountMode, renderInlineMount, renderLauncherScene, squareInlinePanel } from "./mount-mode";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";

renderDemoScaffold({
  slug: "phone-agent-demo",
  blurb:
    "A Sunrise Travel front-desk receptionist on Pipecat's PhoneLLM Mini, a model tuned for voice agents: sub-100 ms time to first token, reliable tool calls, and no reasoning pass. Ask about the weather where you're headed and it looks it up live mid-conversation.",
});

const configInspector = createDemoConfigInspector({ title: "Phone Agent" });

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-phone-agent`
    : `http://localhost:${proxyPort}/api/chat/dispatch-phone-agent`;

// Realtime voice talks to Runtype directly, so it needs a client token and a
// saved agent. Typed chat always goes through the proxy above, so chips keep
// the bundled receptionist's tools whichever voice path is active.
const RUNTYPE_API_URL = "https://api.runtype.com";
const STORAGE_KEYS = {
  voice: "phoneAgentDemoVoice",
  clientToken: "phoneAgentDemoClientToken",
  agentId: "phoneAgentDemoAgentId",
} as const;

const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string): void => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore quota / private mode errors
  }
};

const browserSpeechSupported =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const settings = {
  voice: readStored(STORAGE_KEYS.voice) !== "off",
  clientToken: readStored(STORAGE_KEYS.clientToken) ?? "",
  agentId: readStored(STORAGE_KEYS.agentId) ?? "",
};

type VoicePath = "off" | "browser" | "runtype";

const resolveVoicePath = (): VoicePath => {
  if (!settings.voice) return "off";
  if (settings.clientToken && settings.agentId) return "runtype";
  return browserSpeechSupported ? "browser" : "off";
};

// ---------------------------------------------------------------------------
// Latency readout
// ---------------------------------------------------------------------------

const latencyEls = {
  path: document.getElementById("latency-path"),
  firstEventLabel: document.getElementById("latency-first-event-label"),
  firstWordLabel: document.getElementById("latency-first-word-label"),
  firstEvent: document.getElementById("latency-first-event"),
  tool: document.getElementById("latency-tool"),
  firstWord: document.getElementById("latency-first-word"),
  total: document.getElementById("latency-total"),
};

const formatMs = (ms: number | undefined): string =>
  ms === undefined ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;

type TurnTiming = {
  start: number;
  firstEvent?: number;
  tool?: number;
  toolName?: string;
  firstWord?: number;
  total?: number;
};

let turn: TurnTiming | null = null;

const renderLatency = (): void => {
  const since = (t: number | undefined) => (turn && t !== undefined ? t - turn.start : undefined);
  if (latencyEls.firstEvent) latencyEls.firstEvent.textContent = formatMs(since(turn?.firstEvent));
  if (latencyEls.tool) {
    latencyEls.tool.textContent = turn?.tool !== undefined
      ? `${formatMs(since(turn.tool))}${turn.toolName ? ` · ${turn.toolName}` : ""}`
      : "—";
  }
  if (latencyEls.firstWord) latencyEls.firstWord.textContent = formatMs(since(turn?.firstWord));
  if (latencyEls.total) latencyEls.total.textContent = formatMs(since(turn?.total));
};

const renderLatencyPath = (path: VoicePath): void => {
  const realtime = path === "runtype";
  if (latencyEls.path) {
    latencyEls.path.textContent = realtime
      ? "Last spoken turn: server timings from Runtype realtime voice."
      : "Last typed turn: measured in the browser from send, through the proxy.";
  }
  if (latencyEls.firstEventLabel) latencyEls.firstEventLabel.textContent = realtime ? "First audio" : "First event";
  if (latencyEls.firstWordLabel) latencyEls.firstWordLabel.textContent = realtime ? "LLM time" : "First word";
};

const onSSEEvent = (eventType: string, payload: unknown): void => {
  if (!turn || turn.total !== undefined) return;
  const now = performance.now();
  turn.firstEvent ??= now;
  if (eventType === "tool_start" && turn.tool === undefined) {
    turn.tool = now;
    const toolName = (payload as { toolName?: unknown } | null)?.toolName;
    if (typeof toolName === "string") turn.toolName = toolName;
  }
  if (eventType === "text_delta") turn.firstWord ??= now;
  if (eventType === "execution_complete" || eventType === "execution_error") turn.total = now;
  renderLatency();
};

// Realtime voice reports server-side timings once per spoken turn.
const onVoiceMetrics = (metrics: VoiceMetrics): void => {
  turn = null;
  renderLatencyPath("runtype");
  if (latencyEls.firstEvent) latencyEls.firstEvent.textContent = formatMs(metrics.firstAudioMs);
  if (latencyEls.tool) latencyEls.tool.textContent = "—";
  if (latencyEls.firstWord) latencyEls.firstWord.textContent = formatMs(metrics.llmMs);
  if (latencyEls.total) latencyEls.total.textContent = formatMs(metrics.totalMs);
};

// ---------------------------------------------------------------------------
// Widget config
// ---------------------------------------------------------------------------

const buildVoiceConfig = (path: VoicePath): Partial<AgentWidgetConfig> => {
  if (path === "off") {
    return { voiceRecognition: { enabled: false } };
  }
  if (path === "runtype") {
    // No widget-level clientToken: that would move typed chat off the proxy.
    // The realtime socket speaks its own replies, so no textToSpeech either.
    return {
      voiceRecognition: {
        enabled: true,
        onMetrics: onVoiceMetrics,
        provider: {
          type: "runtype",
          runtype: {
            agentId: settings.agentId,
            clientToken: settings.clientToken,
            host: RUNTYPE_API_URL,
          },
        },
      },
    };
  }
  return {
    voiceRecognition: {
      enabled: true,
      provider: {
        type: "browser",
        browser: { language: "en-US", continuous: false },
      },
    },
    textToSpeech: { enabled: true, provider: "browser" },
  };
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const showLauncherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-phone-agent-demo-${mode}`,
    ),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: showLauncherChrome,
      width: showLauncherChrome ? "min(420px, 95vw)" : "100%",
      title: "Sunrise Travel",
      subtitle: "Front desk, powered by PhoneLLM Mini",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Sunrise Travel front desk",
      welcomeSubtitle:
        "Tap the mic and ask about the weather where you're headed, or type below.",
      inputPlaceholder: "Ask the front desk...",
    },
    suggestionChips: [
      "What's the weather like in Austin right now?",
      "Is it raining in Denver?",
      "I'm flying to Chicago tomorrow. What's it like there today?",
      "Is your office open right now?",
    ],
    onSSEEvent,
    ...buildVoiceConfig(resolveVoicePath()),
  };
};

// ---------------------------------------------------------------------------
// Mounting
// ---------------------------------------------------------------------------

let activeMountMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeTeardown: (() => void) | null = null;

const mountWidget = (mode: Mode, stage: HTMLElement): (() => void) => {
  activeMountMode = mode;
  activeStage = stage;
  turn = null;
  renderLatency();
  renderLatencyPath("browser");
  renderVoiceStatus();

  const config = buildConfig(mode);
  reportDemoConfig(configInspector, { config, mode });

  let controller: AgentWidgetController;
  let destroy: () => void;
  if (mode === "launcher") {
    const { mountEl } = renderLauncherScene(stage);
    const handle = initAgentWidget({ target: mountEl, config });
    controller = handle as unknown as AgentWidgetController;
    destroy = () => handle.destroy();
  } else {
    // inline mounts flush in the page; CSS handles the chrome
    const mount = renderInlineMount(stage);
    mount.style.height = "100%";
    controller = createAgentExperience(mount, squareInlinePanel(config));
    destroy = () => controller.destroy();
  }

  // Realtime voice turns run over the voice socket and never reach onSSEEvent,
  // so this times typed turns on every path; onVoiceMetrics takes over the
  // readout after each spoken turn.
  const offUserMessage = controller.on("user:message", () => {
    turn = { start: performance.now() };
    renderLatencyPath("browser");
    renderLatency();
  });

  return () => {
    offUserMessage();
    destroy();
  };
};

const remount = (): void => {
  if (!activeStage) return;
  activeTeardown?.();
  activeTeardown = mountWidget(activeMountMode, activeStage);
};

// ---------------------------------------------------------------------------
// Rail controls
// ---------------------------------------------------------------------------

const voiceToggle = document.getElementById("voice-toggle") as HTMLInputElement | null;
const voiceStatus = document.getElementById("voice-status");
const credentialsForm = document.getElementById("realtime-voice-form") as HTMLFormElement | null;
const clientTokenInput = document.getElementById("client-token-input") as HTMLInputElement | null;
const agentIdInput = document.getElementById("agent-id-input") as HTMLInputElement | null;

function renderVoiceStatus(): void {
  if (!voiceStatus) return;
  const path = resolveVoicePath();
  voiceStatus.textContent =
    path === "runtype"
      ? "Realtime voice: Runtype transcribes and speaks; PhoneLLM Mini writes the replies"
      : path === "browser"
        ? "Browser voice: your browser transcribes and speaks; PhoneLLM Mini writes the replies"
        : settings.voice && !browserSpeechSupported
          ? "This browser has no speech recognition: typing only"
          : "Typing only";
}

if (voiceToggle) {
  voiceToggle.checked = settings.voice;
  voiceToggle.addEventListener("change", () => {
    settings.voice = voiceToggle.checked;
    writeStored(STORAGE_KEYS.voice, settings.voice ? "on" : "off");
    remount();
  });
}

if (clientTokenInput) clientTokenInput.value = settings.clientToken;
if (agentIdInput) agentIdInput.value = settings.agentId;

credentialsForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  settings.clientToken = clientTokenInput?.value.trim() ?? "";
  settings.agentId = agentIdInput?.value.trim() ?? "";
  writeStored(STORAGE_KEYS.clientToken, settings.clientToken);
  writeStored(STORAGE_KEYS.agentId, settings.agentId);
  remount();
});

// Mount last: the first mount runs synchronously and reads the rail elements above.
setupMountMode({
  slug: "phone-agent-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeTeardown = mountWidget(mode, stage);
    return () => {
      activeTeardown?.();
      activeTeardown = null;
    };
  },
});
