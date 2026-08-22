import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type VoiceProvider,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
import type { Mode } from "./examples-nav";
import {
  createWebSpeechVoiceProvider,
  isWebSpeechSupported,
} from "./custom-voice-provider";

renderDemoScaffold({ slug: "custom-voice-provider-demo" });

const configInspector = createDemoConfigInspector({
  title: "Bring-Your-Own Voice Provider",
});

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
  : `http://localhost:${proxyPort}/api/chat/dispatch`;

const logEl = document.getElementById("log");
const log = (msg: string) => {
  if (logEl) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log(`[CustomVoiceDemo] ${msg}`);
};

const supported = isWebSpeechSupported();
const supportEl = document.getElementById("support-status");
if (supportEl) {
  supportEl.textContent = supported
    ? "✅ Web Speech API available: click the mic and speak; the reply is read back via browser TTS."
    : "⚠️ Web Speech API not available in this browser (try Chrome/Edge). The mic still renders because the provider is custom.";
  supportEl.style.color = supported ? "var(--ok, #10b981)" : "var(--warn, #f59e0b)";
}

// Log both sides of the VoiceProvider contract: the widget's lifecycle calls
// in, and the provider's result/status/error callbacks out.
const instrumentProvider = (provider: VoiceProvider): VoiceProvider => {
  provider.onStatusChange((status) => log(`provider → onStatusChange: ${status}`));
  provider.onResult((result) => {
    const confidence =
      result.confidence !== undefined
        ? ` (confidence ${result.confidence.toFixed(2)})`
        : "";
    log(`provider → onResult: "${result.text}"${confidence}`);
  });
  provider.onError((error) => log(`provider → onError: ${error.message}`));
  return {
    type: provider.type,
    connect: () => {
      log("widget → connect()");
      return provider.connect();
    },
    disconnect: () => {
      log("widget → disconnect()");
      return provider.disconnect();
    },
    startListening: () => {
      log("widget → startListening()");
      return provider.startListening();
    },
    stopListening: () => {
      log("widget → stopListening()");
      return provider.stopListening();
    },
    onResult: (cb) => provider.onResult(cb),
    onError: (cb) => provider.onError(cb),
    onStatusChange: (cb) => provider.onStatusChange(cb),
  };
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-custom-voice-${mode}`,
    ),
    // The bring-your-own provider: `type: 'custom'` plus a factory that returns
    // our Web Speech adapter. Persona calls the factory when it sets up voice,
    // wires the mic button to it, and sends each final transcript as a user
    // message: no special-casing of the provider type anywhere else.
    voiceRecognition: {
      enabled: true,
      processingText: "🎤 Transcribing…",
      provider: {
        type: "custom",
        custom: () =>
          instrumentProvider(createWebSpeechVoiceProvider({ language: "en-US" })),
      },
    },
    // Speech back: textToSpeech is a separate subsystem from voice input, so it
    // pairs with any provider: including our STT-only custom one. Browser TTS
    // reads each assistant reply aloud (via speechSynthesis) when streaming
    // ends, closing the loop: talk in → custom STT → agent → spoken reply out.
    textToSpeech: {
      enabled: true,
      provider: "browser",
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
      title: "BYO Voice",
      subtitle: "Custom speech provider",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Bring-Your-Own Voice",
      welcomeSubtitle:
        "Custom Web Speech provider in via provider.custom; replies spoken back via browser TTS.",
      inputPlaceholder: "Tap the mic and speak, or type…",
    },
    suggestionChips: ["What can you do?", "Tell me a joke"],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

setupMountMode({
  slug: "custom-voice-provider-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { controller, teardown } = runWidgetMountWithInspector(
      configInspector,
      mode,
      stage,
      buildConfig,
    );
    // The speech-out half of the loop: browser TTS reading the reply back.
    const unsubscribe = controller.on("message:read-aloud", (event) => {
      log(`tts → read-aloud: ${event.state}`);
    });
    return () => {
      unsubscribe();
      teardown();
    };
  },
});

log(
  supported
    ? "BYO voice demo ready. Click the mic and the log traces each VoiceProvider contract call."
    : "BYO voice demo ready. Web Speech isn't supported here, but the wiring is identical for any custom provider.",
);
