// UI SDK Agent Bridge demo: Persona's agent operates a form built with UI SDK
// (https://ui-sdk.dev) web components through the three WebMCP tools the UI
// SDK bridge publishes. The page registers no tools of its own.
//
// The polyfill must be installed before `registerTools` runs: the bridge only
// registers when `document.modelContext` already exists.
import "@mcp-b/global";
import "@runtypelabs/persona/widget.css";
import "./style.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  markdownPostprocessor,
  type AgentWidgetConfig,
} from "@runtypelabs/persona";
import { createAgent, registerTools } from "@ui-sdk/web/agent";
import { createHistory } from "@ui-sdk/web/history";

import { createDemoConfigInspector } from "../demo-config-inspector";
import { renderDemoScaffold } from "../demo-scaffold";
import type { Mode } from "../examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "../mount-mode";
import { describeBridgeApproval, isAutoApprovedBridgeCall } from "./approval-policy";
import { askPerson } from "./person-confirm";
import { mountSettingsForm } from "./settings-form";

renderDemoScaffold({ slug: "webmcp-ui-sdk" });

const configInspector = createDemoConfigInspector({ title: "UI SDK Agent Bridge" });

const formRoot = document.querySelector<HTMLElement>("#settings-form");
if (!formRoot) {
  throw new Error("[UI SDK demo] Missing #settings-form in webmcp-ui-sdk.html");
}
const form = mountSettingsForm(formRoot);

// ── The bridge ──────────────────────────────────────────────────────────────
// `createAgent` reads every UI SDK component on the page. `registerTools`
// publishes it as the WebMCP tools `snapshot`, `query` and `act`, for Persona
// and for any other WebMCP consumer on the page.
//
// `allow` is the page's own guard, so it must be safe without Persona's
// approval bubble: a step on a control marked `data-agent-confirm` arrives
// with `step.confirm` set, and returning `true` for it would let any consumer
// press that control. The page asks the person itself.
const bridge = createAgent();
const unregisterTools = registerTools(bridge, {
  allow: (step, { signal }) =>
    step.confirm
      ? askPerson({ consequence: step.confirm, control: step.label ?? step.ref, signal })
      : true,
});
const history = createHistory(bridge, { within: () => formRoot });

// ── Activity log + live snapshot ────────────────────────────────────────────
const logEl = document.querySelector<HTMLElement>("#bridge-log");
const snapshotEl = document.querySelector<HTMLElement>("#bridge-snapshot");
const undoButton = document.querySelector<HTMLButtonElement>("#undo-agent");

const formatValue = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const appendLog = (source: string, message: string) => {
  if (!logEl) return;
  const row = document.createElement("div");
  row.className = "ui-sdk-log-row";
  row.dataset.source = source === "agent" ? "agent" : "person";
  const badge = document.createElement("span");
  badge.className = "ui-sdk-log-source";
  badge.textContent = source;
  const text = document.createElement("span");
  text.textContent = message;
  row.append(badge, text);
  logEl.prepend(row);
};

let snapshotQueued = false;
const refreshSnapshot = () => {
  if (snapshotQueued || !snapshotEl) return;
  snapshotQueued = true;
  requestAnimationFrame(() => {
    snapshotQueued = false;
    snapshotEl.textContent = JSON.stringify(bridge.snapshot(), null, 2);
  });
};

let agentChangeCount = 0;
const syncUndoButton = () => {
  if (undoButton) undoButton.disabled = agentChangeCount === 0;
};

const stopObserving = bridge.subscribe((change) => {
  const name = change.label ?? change.component;
  appendLog(change.source, `${name}: ${change.key} → ${formatValue(change.value)}`);
  if (change.key === "value" || change.key === "checked") form.markDirty();
  if (change.source === "agent") agentChangeCount += 1;
  syncUndoButton();
  refreshSnapshot();
});

undoButton?.addEventListener("click", async () => {
  const notRestored = await history.undoSource("agent");
  agentChangeCount = 0;
  syncUndoButton();
  appendLog(
    "undo",
    notRestored.length === 0
      ? "Restored every field the agent changed."
      : `Restored the agent's changes except ${notRestored.length}.`,
  );
  refreshSnapshot();
});

syncUndoButton();
// The custom elements upgrade before this module runs, but their parts bind on
// the next frame; read the first snapshot after that.
requestAnimationFrame(refreshSnapshot);

// ── Persona ─────────────────────────────────────────────────────────────────
// Proxy mode: the agent is pinned server-side as WEBMCP_UI_SDK_AGENT
// (packages/proxy/src/agents/webmcp-ui-sdk.ts) and mounted at
// /api/chat/dispatch-ui-sdk (examples/runtype-hono-proxy/src/app.ts).
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-ui-sdk`
  : `http://localhost:${proxyPort}/api/chat/dispatch-ui-sdk`;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const launcherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl,
    storageAdapter: createLocalStorageAdapter(`persona-state-webmcp-ui-sdk-${mode}`),
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: launcherChrome,
      width: launcherChrome ? "min(420px, 95vw)" : "100%",
      title: "Settings Copilot",
      subtitle: "Operates this page's form",
    },
    welcome: {
      title: "Settings Copilot",
      subtitle:
        "I can read and change the settings form on this page through its UI SDK components.",
      variant: "card",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      inputPlaceholder: "Ask Copilot to read or change the settings…",
    },
    suggestions: {
      starters: {
        items: [
          "What are the current settings?",
          "Rename the workspace to Northwind Labs and move it to Europe",
          "Turn on two-factor sign-in, keep logs for 90 days, then save",
          "Delete this workspace",
        ],
        variant: "chip",
        placement: "composer",
        overflow: "wrap",
        maxItems: 4,
      },
    },
    webmcp: {
      enabled: true,
      // The form is one shared piece of state: run the calls of a turn in order.
      execution: "sequential",
      // Reads and field edits run straight away. An `act` call that presses a
      // button falls through to the approval bubble, unless the button is a
      // marked control the page confirms itself.
      autoApprove: (info) =>
        isAutoApprovedBridgeCall(info.toolName, info.args, bridge.snapshot()),
    },
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      toolCallDisplay: { grouped: true, groupedMode: "collapsible" },
    },
    approval: {
      ...DEFAULT_WIDGET_CONFIG.approval,
      title: "Allow this action?",
      approveLabel: "Allow",
      denyLabel: "Cancel",
      detailsDisplay: "collapsed",
      formatDescription: ({ toolName, parameters }) =>
        describeBridgeApproval(toolName, parameters, bridge.snapshot()),
    },
  };
};

setupMountMode({
  slug: "webmcp-ui-sdk",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    const { teardown } = runWidgetMountWithInspector(configInspector, mode, stage, buildConfig);
    return teardown;
  },
});

// Handles for the browser console: `uiSdkBridge.snapshot()`.
Object.assign(window, { uiSdkBridge: bridge });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unregisterTools();
    stopObserving();
    history.destroy();
  });
}
