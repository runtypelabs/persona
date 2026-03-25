import "@runtypelabs/persona/widget.css";
import "./demo-shared.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget
} from "@runtypelabs/persona";

const sharedStorage = createLocalStorageAdapter("persona-event-stream-demo-state");

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ?
    `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch` :
    `http://localhost:${proxyPort}/api/chat/dispatch`;

const persistKeyPrefix = "persona-event-stream-demo-";

const baseConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Event stream demo",
    welcomeSubtitle: "Try the controls in the left panel — toggle the event stream inspector on each widget.",
    inputPlaceholder: "Message is optional for API testing…"
  },
  features: {
    showEventStreamToggle: true
  },
  persistState: {
    keyPrefix: persistKeyPrefix
  },
  storageAdapter: sharedStorage
};

const inlineMount = document.getElementById("es-inline-widget");
if (!inlineMount) {
  throw new Error("es-inline-widget mount missing");
}

const inlineController = createAgentExperience(inlineMount, {
  ...baseConfig,
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    width: "100%",
    enabled: false,
    fullHeight: true
  }
});

const launcherController = initAgentWidget({
  target: "#launcher-root",
  config: {
    ...baseConfig,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      title: "Event stream (launcher)",
      subtitle: "Use window events with instanceId launcher-root.",
      iconUrl: "https://dummyimage.com/96x96/111827/ffffff&text=AI",
      closeButtonColor: "#6b7280",
      collapsedMaxWidth: "min(380px, calc(100vw - 48px))"
    }
  }
});

const targetSelect = document.getElementById("es-target-widget") as HTMLSelectElement | null;
const getTarget = () => (targetSelect?.value === "launcher" ? launcherController : inlineController);
const targetLabel = () => (targetSelect?.value === "launcher" ? "launcher" : "inline");

document.getElementById("es-open-launcher")?.addEventListener("click", () => launcherController.open());
document.getElementById("es-toggle-launcher")?.addEventListener("click", () => launcherController.toggle());

document.getElementById("es-show")?.addEventListener("click", () => getTarget().showEventStream());
document.getElementById("es-hide")?.addEventListener("click", () => getTarget().hideEventStream());
document.getElementById("es-check")?.addEventListener("click", () => {
  const visible = getTarget().isEventStreamVisible();
  alert(`${targetLabel()} event stream visible: ${visible}`);
});

document.getElementById("es-win-show-all")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:showEventStream"));
});
document.getElementById("es-win-hide-all")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:hideEventStream"));
});
document.getElementById("es-win-show-inline")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:showEventStream", { detail: { instanceId: "es-inline-widget" } })
  );
});
document.getElementById("es-win-show-launcher")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:showEventStream", { detail: { instanceId: "launcher-root" } })
  );
});
document.getElementById("es-win-show-wrong")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:showEventStream", { detail: { instanceId: "wrong-id" } }));
  alert('Dispatched persona:showEventStream with instanceId "wrong-id" — nothing should open.');
});

const esLogEl = document.getElementById("es-log");
const esLogPre = document.getElementById("es-log-pre");
document.getElementById("es-listen")?.addEventListener("click", () => {
  if (esLogEl) esLogEl.style.display = "block";
  const log = (msg: string) => {
    if (esLogPre) {
      esLogPre.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      esLogPre.parentElement!.scrollTop = esLogPre.parentElement!.scrollHeight;
    }
    console.log(`[EventStream] ${msg}`);
  };
  inlineController.on("eventStream:opened", (e) => log(`inline opened (ts: ${e.timestamp})`));
  inlineController.on("eventStream:closed", (e) => log(`inline closed (ts: ${e.timestamp})`));
  launcherController.on("eventStream:opened", (e) => log(`launcher opened (ts: ${e.timestamp})`));
  launcherController.on("eventStream:closed", (e) => log(`launcher closed (ts: ${e.timestamp})`));
  log("Listeners registered for inline and launcher");
});

const loadBtn = document.getElementById("es-load-messages");
if (loadBtn) {
  loadBtn.addEventListener("click", () => {
    const messageCount = 1000;
    const chunksPerMessage = 5;
    const isLauncher = targetSelect?.value === "launcher";
    const target = isLauncher ? launcherController : inlineController;
    const baseTime = Date.now() - messageCount * 1000;

    if (isLauncher) {
      launcherController.open();
    }

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

    target.injectMessageBatch(batch);

    for (let msg = 0; msg < messageCount; msg++) {
      const msgNum = msg + 1;
      const isUser = msg % 2 === 0;

      if (isUser) {
        target.__pushEventStreamEvent({
          type: "step_delta",
          payload: { type: "step_delta", text: batch[msg].content, stepType: "prompt" }
        });
        target.__pushEventStreamEvent({
          type: "step_complete",
          payload: { type: "step_complete", result: { response: batch[msg].content } }
        });
      } else {
        for (let chunk = 0; chunk < chunksPerMessage; chunk++) {
          const chunkStart = Math.floor((chunk / chunksPerMessage) * batch[msg].content.length);
          const chunkEnd = Math.floor(((chunk + 1) / chunksPerMessage) * batch[msg].content.length);
          target.__pushEventStreamEvent({
            type: "step_delta",
            payload: {
              type: "step_delta",
              text: batch[msg].content.slice(chunkStart, chunkEnd),
              stepType: "prompt",
              messageId: `ast_${msg}`
            }
          });
        }
        target.__pushEventStreamEvent({
          type: "step_complete",
          payload: { type: "step_complete", result: { response: batch[msg].content }, messageId: `ast_${msg}` }
        });
      }

      if (msg % 20 === 0) {
        for (const t of ["reason_start", "reason_delta", "reason_complete", "tool_start", "tool_delta", "tool_complete"]) {
          target.__pushEventStreamEvent({
            type: t,
            payload: {
              type: t,
              text: `Simulated ${t} for msg #${msgNum}`,
              toolName: t.startsWith("tool") ? "web_search" : undefined
            }
          });
        }
      }
    }

    target.__pushEventStreamEvent({
      type: "flow_complete",
      payload: { type: "flow_complete", messageCount }
    });

    const name = isLauncher ? "launcher" : "inline";
    console.log(`[Event stream demo] Injected ${messageCount} messages + events into ${name}`);
    loadBtn.textContent = `Loaded into ${name}!`;
    setTimeout(() => {
      loadBtn.textContent = "Load 1000 messages";
    }, 2000);
  });
}
