import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";
import "./demo-shared.css";

import {
  createLocalStorageAdapter,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "event-stream-testing" });

const configInspector = createDemoConfigInspector({ title: "Event Inspector" });

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
        "Try the controls in the left panel: toggle the event stream inspector on this widget.",
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
    const { controller, teardown } = runWidgetMountWithInspector(
      configInspector,
      mode,
      stage,
      buildConfig,
    );
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
  alert('Dispatched persona:showEventStream with instanceId "wrong-id": nothing should open.');
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

    let seq = 0;
    const push = (type: string, payload: Record<string, unknown> = {}) =>
      ctrl.__pushEventStreamEvent({
        type,
        payload: { type, executionId: "inspector-demo", seq: seq++, ...payload },
      });
    push("execution_start", { kind: "agent", startedAt: new Date(baseTime).toISOString() });
    for (let msg = 0; msg < messageCount; msg++) {
      const role = batch[msg].role;
      const turnId = `turn_${msg}`;
      push("turn_start", { id: turnId, role });
      if (role === "assistant") {
        const id = `text_${msg}`;
        push("text_start", { id, turnId, role });
        for (let chunk = 0; chunk < chunksPerMessage; chunk++) {
          const chunkStart = Math.floor((chunk / chunksPerMessage) * batch[msg].content.length);
          const chunkEnd = Math.floor(((chunk + 1) / chunksPerMessage) * batch[msg].content.length);
          push("text_delta", { id, delta: batch[msg].content.slice(chunkStart, chunkEnd) });
        }
        push("text_complete", { id, text: batch[msg].content });
      }
      push("turn_complete", { id: turnId, role, content: batch[msg].content });
      if (msg % 20 === 0) {
        const reasonId = `reason_${msg}`;
        push("reasoning_start", { id: reasonId });
        push("reasoning_delta", { id: reasonId, delta: `Simulated reasoning for message ${msg + 1}` });
        push("reasoning_complete", { id: reasonId });
        const toolId = `tool_${msg}`;
        push("tool_start", { toolCallId: toolId, toolName: "web_search", toolType: "builtin" });
        push("tool_output_delta", { toolCallId: toolId, delta: "Searching…" });
        push("tool_complete", { toolCallId: toolId, toolName: "web_search", success: true });
      }
    }
    push("execution_complete", { kind: "agent", success: true });

    console.log(`[Event stream demo] Injected ${messageCount} messages + events`);
    loadBtn.textContent = "Loaded!";
    setTimeout(() => {
      loadBtn.textContent = "Load 1000 messages";
    }, 2000);
  });
}
