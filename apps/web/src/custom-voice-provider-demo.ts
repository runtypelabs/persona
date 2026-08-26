import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  createAgentExperience,
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
          instrumentProvider(
            createWebSpeechVoiceProvider({
              language: "en-US",
              // Opt into `onLevel`: the adapter opens a second analysis-only
              // stream and reports RMS, which the widget publishes as
              // `--persona-voice-level`.
              reportLevel: true,
              onLevelUnavailable: (reason) =>
                log(`Live level unavailable: ${reason}. Dictation is unaffected.`),
            })
          ),
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

// --- Live level readout + sidebar mirror ------------------------------------
// `--persona-voice-level` is a CSS custom property, so it inherits DOWN from
// the elements the widget writes it to (the composer footer and the mic
// wrapper). A waveform placed INSIDE the composer needs no JavaScript at all.
//
// This demo's bars live in the sidebar, outside the widget subtree, so the
// value has to be copied across. That copy is the only JavaScript involved:
// the bar geometry is still pure CSS reading the variable.
const readoutEl = document.querySelector<HTMLElement>("[data-waveform-readout]");
const waveformEl = document.querySelector<HTMLElement>("[data-waveform]");
if (readoutEl || waveformEl) {
  let lastRaw: string | null = null;
  const readLevel = (): void => {
    const footer = document
      .querySelector<HTMLElement>("[data-persona-composer-form]")
      ?.closest<HTMLElement>(".persona-widget-footer");
    const raw = footer
      ? getComputedStyle(footer).getPropertyValue("--persona-voice-level").trim()
      : "";
    if (raw !== lastRaw) {
      lastRaw = raw;
      if (readoutEl) {
        readoutEl.textContent = raw === "" ? "Level: idle" : `Level: ${raw}`;
      }
      if (waveformEl) {
        if (raw === "") waveformEl.style.removeProperty("--persona-voice-level");
        else waveformEl.style.setProperty("--persona-voice-level", raw);
      }
    }
    requestAnimationFrame(readLevel);
  };
  requestAnimationFrame(readLevel);
}

// --- Hosted realtime voice (opt-in, env-gated) ------------------------------
// Renders only with a client token AND a voice-enabled agent id. Everything
// else on this page is keyless, so the absent case explains itself instead of
// failing at runtime.
const runtypeSlot = document.querySelector<HTMLElement>("[data-runtype-slot]");
// Voice needs a token bound to a voice-enabled agent, which the shared chat
// token may not be. Same per-demo override pattern as VITE_CLIENT_TOKEN_SIMPLE_CHAT.
const runtypeToken =
  import.meta.env.VITE_VOICE_CLIENT_TOKEN || import.meta.env.VITE_CLIENT_TOKEN || "";
const runtypeVoiceAgentId = import.meta.env.VITE_VOICE_AGENT_ID || "";

if (runtypeSlot) {
  if (runtypeToken && runtypeVoiceAgentId) {
    const host = document.createElement("div");
    host.className = "runtype-voice-stage";
    const caption = document.createElement("p");
    caption.textContent =
      "This second widget uses the built-in runtype provider. Its levels come from the streaming capture loop, so no second microphone stream is opened.";
    runtypeSlot.append(caption, host);

    createAgentExperience(host, {
      ...DEFAULT_WIDGET_CONFIG,
      clientToken: runtypeToken,
      storageAdapter: createLocalStorageAdapter(
        "persona-state-custom-voice-runtype",
      ),
      voiceRecognition: {
        enabled: true,
        provider: {
          type: "runtype",
          runtype: {
            agentId: runtypeVoiceAgentId,
            clientToken: runtypeToken,
          },
        },
      },
      launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%" },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Hosted realtime voice",
        welcomeSubtitle:
          "Full-duplex runtype provider: it streams its own spoken reply.",
        inputPlaceholder: "Tap the mic to talk…",
      },
      suggestionChips: [],
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
    });
    log("Hosted realtime voice section mounted from the voice client token.");
  } else {
    const note = document.createElement("p");
    note.className = "hint";
    note.innerHTML =
      "Set <code>VITE_VOICE_CLIENT_TOKEN</code> (or reuse <code>VITE_CLIENT_TOKEN</code>) and <code>VITE_VOICE_AGENT_ID</code> to mount a second widget here using the built-in <code>runtype</code> provider, whose levels come from its streaming capture loop rather than a second microphone stream. The token must be bound to a voice-enabled agent. Without them this page stays keyless and runs entirely on the local proxy.";
    runtypeSlot.appendChild(note);
  }
}

log(
  supported
    ? "BYO voice demo ready. Click the mic and the log traces each VoiceProvider contract call."
    : "BYO voice demo ready. Web Speech isn't supported here, but the wiring is identical for any custom provider.",
);
