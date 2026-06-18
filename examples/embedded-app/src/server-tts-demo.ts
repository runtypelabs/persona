import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
import type { Mode } from "./examples-nav";
import { ServerTtsEngine } from "./server-tts-engine";

renderDemoScaffold({ slug: "server-tts-demo" });

const configInspector = createDemoConfigInspector({
  title: "Server TTS (streaming)",
});

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyBase = import.meta.env.VITE_PROXY_URL
  ? import.meta.env.VITE_PROXY_URL
  : `http://localhost:${proxyPort}`;
const dispatchUrl = `${proxyBase}/api/chat/dispatch`;
const ttsUrl = `${proxyBase}/api/tts`;

const logEl = document.getElementById("log");
const log = (msg: string) => {
  if (logEl) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log(`[ServerTtsDemo] ${msg}`);
};

// A live voice picker: the engine reads this at speak time, so switching voices
// takes effect on the next "Read aloud" with no widget rebuild.
const voiceSelect = document.getElementById("voice-select") as HTMLSelectElement | null;
const getVoice = (): string | undefined => voiceSelect?.value || undefined;
voiceSelect?.addEventListener("change", () =>
  log(`voice → ${voiceSelect.value}`),
);

// Model picker: tts-1 is fast + steady (snappy start); gpt-4o-mini-tts is higher
// quality but slower and burstier to start. Read at speak time — no rebuild.
const modelSelect = document.getElementById("model-select") as HTMLSelectElement | null;
const getModel = (): string | undefined => modelSelect?.value || undefined;
modelSelect?.addEventListener("change", () => log(`model → ${modelSelect.value}`));

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: dispatchUrl,
    storageAdapter: createLocalStorageAdapter(`persona-state-server-tts-${mode}`),
    // The whole demo: a hosted streaming engine instead of browser speechSynthesis.
    // `enabled: false` means no auto-speak — the per-message "Read aloud" button
    // still uses this engine. Flip it to `true` to also auto-speak every reply.
    // The engine streams PCM from the proxy /api/tts route through Persona's
    // createPcmStreamPlayer(), so playback starts once the jitter buffer fills and
    // pause/resume are real (supportsPause: true).
    textToSpeech: {
      enabled: false,
      createEngine: () =>
        new ServerTtsEngine({
          endpoint: ttsUrl,
          getVoice,
          getModel,
          onError: (err) => log(`⚠️ read-aloud failed — ${err.message}`),
        }),
    },
    messageActions: {
      ...DEFAULT_WIDGET_CONFIG.messageActions,
      showReadAloud: true,
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
      title: "Server TTS",
      subtitle: "Streaming OpenAI voices",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Streaming server TTS",
      welcomeSubtitle:
        "Ask anything, then press “Read aloud” to hear the reply in an OpenAI voice — streamed as PCM through the proxy.",
      inputPlaceholder: "Ask a question, then read the reply aloud…",
    },
    suggestionChips: [
      "Explain streaming TTS in one sentence",
      "Tell me a two-sentence story",
    ],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

// Friendly labels for the four read-aloud states emitted by message:read-aloud.
const READ_ALOUD_LABEL: Record<string, string> = {
  loading: "⏳ fetching audio…",
  playing: "▶️ playing",
  paused: "⏸️ paused",
  idle: "⏹️ stopped",
};

setupMountMode({
  slug: "server-tts-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { controller, teardown } = runWidgetMountWithInspector(
      configInspector,
      mode,
      stage,
      buildConfig,
    );
    const unsubscribe = controller.on("message:read-aloud", (event) => {
      log(`read-aloud · ${READ_ALOUD_LABEL[event.state] ?? event.state}`);
    });
    return () => {
      unsubscribe();
      teardown();
    };
  },
});

log(
  "Server TTS demo ready. Send a message, then click “Read aloud” on the reply. Requires OPENAI_API_KEY on the proxy.",
);
