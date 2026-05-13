import "@runtypelabs/persona/widget.css";
import "./demo-shared.css";

import {
  createLocalStorageAdapter,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMount } from "./mount-mode";
import type { Mode } from "./examples-nav";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

const sharedStorage = createLocalStorageAdapter("persona-event-stream-demo-state");

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Event stream demo",
      welcomeSubtitle:
        "Try the controls in the left panel — toggle the event stream inspector on this widget.",
      inputPlaceholder: "Message is optional for API testing…",
    },
    features: { showEventStreamToggle: true },
    persistState: { keyPrefix: "persona-event-stream-demo-" },
    storageAdapter: sharedStorage,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
      fullHeight: !isLauncher,
      title: isLauncher ? "Event stream (launcher)" : undefined,
      subtitle: isLauncher
        ? "Use window events with this launcher's instance."
        : undefined,
      iconUrl: isLauncher
        ? "https://dummyimage.com/96x96/111827/ffffff&text=AI"
        : undefined,
    },
  };
};

let activeController: AgentWidgetController | null = null;
let registeredListenerController: AgentWidgetController | null = null;
let logger: ((msg: string) => void) | null = null;

setupMountMode({
  slug: "event-stream-testing",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { controller, teardown } = runWidgetMount(mode, stage, buildConfig(mode));
    activeController = controller;
    // Re-register listeners against the new controller if the user clicked "Register listeners" before.
    if (logger) {
      controller.on("eventStream:opened", (e) =>
        logger?.(`${mode} opened (ts: ${e.timestamp})`),
      );
      controller.on("eventStream:closed", (e) =>
        logger?.(`${mode} closed (ts: ${e.timestamp})`),
      );
      registeredListenerController = controller;
    }
    return () => {
      teardown();
      activeController = null;
      if (registeredListenerController === controller) {
        registeredListenerController = null;
      }
    };
  },
});

const target = () => activeController;

document.getElementById("es-open-launcher")?.addEventListener("click", () => target()?.open?.());
document.getElementById("es-toggle-launcher")?.addEventListener("click", () => target()?.toggle?.());

document.getElementById("es-show")?.addEventListener("click", () => target()?.showEventStream());
document.getElementById("es-hide")?.addEventListener("click", () => target()?.hideEventStream());
document.getElementById("es-check")?.addEventListener("click", () => {
  const visible = target()?.isEventStreamVisible();
  alert(`Event stream visible: ${visible}`);
});

document.getElementById("es-win-show-all")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:showEventStream"));
});
document.getElementById("es-win-hide-all")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:hideEventStream"));
});
document.getElementById("es-win-show-wrong")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:showEventStream", { detail: { instanceId: "wrong-id" } }),
  );
  alert('Dispatched persona:showEventStream with instanceId "wrong-id" — nothing should open.');
});

const esLogEl = document.getElementById("es-log");
const esLogPre = document.getElementById("es-log-pre");
document.getElementById("es-listen")?.addEventListener("click", () => {
  if (esLogEl) esLogEl.style.display = "block";
  logger = (msg: string) => {
    if (esLogPre) {
      esLogPre.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      esLogPre.parentElement!.scrollTop = esLogPre.parentElement!.scrollHeight;
    }
    console.log(`[EventStream] ${msg}`);
  };
  if (activeController && registeredListenerController !== activeController) {
    activeController.on("eventStream:opened", (e) =>
      logger?.(`opened (ts: ${e.timestamp})`),
    );
    activeController.on("eventStream:closed", (e) =>
      logger?.(`closed (ts: ${e.timestamp})`),
    );
    registeredListenerController = activeController;
  }
  logger("Listeners registered against active widget");
});

const loadBtn = document.getElementById("es-load-messages");
if (loadBtn) {
  loadBtn.addEventListener("click", () => {
    const ctrl = target();
    if (!ctrl) return;
    const messageCount = 1000;
    const chunksPerMessage = 5;
    const baseTime = Date.now() - messageCount * 1000;
    ctrl.open?.();

    const batch: Array<{ role: "user" | "assistant"; content: string; createdAt: string }> = [];
    for (let msg = 0; msg < messageCount; msg++) {
      const msgNum = msg + 1;
      const isUser = msg % 2 === 0;
      const timestamp = new Date(baseTime + msg * 1000).toISOString();
      if (isUser) {
        const content = `Test question #${Math.ceil(msgNum / 2)}: What is ${Math.ceil(msgNum / 2) * 7}?`;
        batch.push({ role: "user", content, createdAt: timestamp });
      } else {
        const fullText = `The answer to question #${Math.ceil(msgNum / 2)} is **${Math.ceil(msgNum / 2) * 7}**. Here's some extra text to make the message more realistic and test rendering with longer content.`;
        batch.push({ role: "assistant", content: fullText, createdAt: timestamp });
      }
    }
    ctrl.injectMessageBatch(batch);

    for (let msg = 0; msg < messageCount; msg++) {
      const msgNum = msg + 1;
      const isUser = msg % 2 === 0;
      if (isUser) {
        ctrl.__pushEventStreamEvent({
          type: "step_delta",
          payload: { type: "step_delta", text: batch[msg].content, stepType: "prompt" },
        });
        ctrl.__pushEventStreamEvent({
          type: "step_complete",
          payload: { type: "step_complete", result: { response: batch[msg].content } },
        });
      } else {
        for (let chunk = 0; chunk < chunksPerMessage; chunk++) {
          const chunkStart = Math.floor((chunk / chunksPerMessage) * batch[msg].content.length);
          const chunkEnd = Math.floor(((chunk + 1) / chunksPerMessage) * batch[msg].content.length);
          ctrl.__pushEventStreamEvent({
            type: "step_delta",
            payload: {
              type: "step_delta",
              text: batch[msg].content.slice(chunkStart, chunkEnd),
              stepType: "prompt",
              messageId: `ast_${msg}`,
            },
          });
        }
        ctrl.__pushEventStreamEvent({
          type: "step_complete",
          payload: { type: "step_complete", result: { response: batch[msg].content }, messageId: `ast_${msg}` },
        });
      }
      if (msg % 20 === 0) {
        for (const t of ["reason_start", "reason_delta", "reason_complete", "tool_start", "tool_delta", "tool_complete"]) {
          ctrl.__pushEventStreamEvent({
            type: t,
            payload: {
              type: t,
              text: `Simulated ${t} for msg #${msgNum}`,
              toolName: t.startsWith("tool") ? "web_search" : undefined,
            },
          });
        }
      }
    }
    ctrl.__pushEventStreamEvent({
      type: "flow_complete",
      payload: { type: "flow_complete", messageCount },
    });

    console.log(`[Event stream demo] Injected ${messageCount} messages + events`);
    loadBtn.textContent = "Loaded!";
    setTimeout(() => {
      loadBtn.textContent = "Load 1000 messages";
    }, 2000);
  });
}
