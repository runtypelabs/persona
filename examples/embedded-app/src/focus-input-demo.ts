import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { setupMountMode, runWidgetMountWithInspector } from "./mount-mode";
import { createDemoConfigInspector } from "./demo-config-inspector";
import type { Mode } from "./examples-nav";

renderDemoScaffold({ slug: "focus-input-demo" });

const configInspector = createDemoConfigInspector({ title: "Programmatic Input Focus" });

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

const logEl = document.getElementById("log");
const log = (msg: string) => {
  if (logEl) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log(`[FocusDemo] ${msg}`);
};

const STORAGE_KEY = "focus-demo-autoFocusInput";
let autoFocus = localStorage.getItem(STORAGE_KEY) === "true";

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const isLauncher = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    storageAdapter: createLocalStorageAdapter(
      `persona-state-focus-input-${mode}`,
    ),
    autoFocusInput: autoFocus,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: isLauncher,
      width: isLauncher ? "min(420px, 95vw)" : "100%",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Focus Input Demo",
      welcomeSubtitle: "Test autoFocusInput, controller.focusInput(), and persona:focusInput.",
      inputPlaceholder: "Type here…",
    },
    suggestionChips: ["Hello", "Focus test"],
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
  };
};

let activeController: AgentWidgetController | null = null;

setupMountMode({
  slug: "focus-input-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { controller, teardown } = runWidgetMountWithInspector(
      configInspector,
      mode,
      stage,
      buildConfig,
    );
    activeController = controller;
    return () => {
      teardown();
      activeController = null;
    };
  },
});

const autoFocusToggle = document.getElementById("auto-focus-toggle") as HTMLInputElement | null;
if (autoFocusToggle) autoFocusToggle.checked = autoFocus;
autoFocusToggle?.addEventListener("change", () => {
  autoFocus = autoFocusToggle.checked;
  localStorage.setItem(STORAGE_KEY, autoFocus ? "true" : "false");
  activeController?.update({ autoFocusInput: autoFocus });
  log(`autoFocusInput: ${autoFocus ? "on" : "off"}`);
});

document.getElementById("focus-active")?.addEventListener("click", () => {
  const ok = activeController?.focusInput();
  log(`focusInput() on active: ${ok ? "ok" : "failed (panel closed or no textarea)"}`);
});

document.getElementById("focus-win-all")?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("persona:focusInput"));
  log("Dispatched persona:focusInput (all instances)");
});

document.getElementById("focus-win-wrong")?.addEventListener("click", () => {
  window.dispatchEvent(
    new CustomEvent("persona:focusInput", { detail: { instanceId: "wrong-id" } }),
  );
  log("Dispatched persona:focusInput (instanceId: wrong-id): no effect expected");
});

log("Focus Input Demo ready. Toggle mount above to compare inline vs launcher.");
