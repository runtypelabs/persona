import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type HistoryIdentityStatus,
} from "@runtypelabs/persona";
// Source-only demo seam. `setHistoryProviderFactory` ships in the bundle (a few
// lines); the in-memory provider itself is not exported by the package, so it
// only exists for pages that resolve the workspace source through the Vite
// alias. Production always builds the Runtype provider from client-token config.
import { setHistoryProviderFactory } from "@runtypelabs/persona/internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryOperation,
  type DemoHistoryProvider,
} from "@runtypelabs/persona/internal/demo-history-provider";
import type { HistoryProviderErrorCode } from "@runtypelabs/persona/internal/history-provider";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import { createPinnedSectionPlugin } from "./plugins/pinned-section-plugin";
import { createThreadRailPlugin } from "./plugins/thread-rail-plugin";
import type { Mode } from "./examples-nav";

type Source = "demo" | "staging";
type Presentation = "panel" | "rail" | "auto";

/**
 * Live source. Defaults to the production API, which serves the history
 * contract; override VITE_HISTORY_API_URL to test a staging host. The client
 * token must allow this page's origin (origin-locking is configured per token
 * in the Runtype dashboard).
 */
const LIVE_API_URL =
  import.meta.env.VITE_HISTORY_API_URL || "https://api.runtype.com";
const LIVE_CLIENT_TOKEN = import.meta.env.VITE_CLIENT_TOKEN_HISTORY ?? "";

let source: Source = "demo";
let presentation: Presentation = "panel";
/** Swaps Persona's Messages view for the demo `renderHistoryView` plugin. */
let customView = false;
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;
let provider: DemoHistoryProvider = createDemoHistoryProvider();

const scaffold = renderDemoScaffold({
  slug: "history-demo",
  title: "Conversation History",
  blurb:
    "The Messages surface end to end: panel and rail presentations, every identity and list state, and the same core surface against the live Runtype API.",
  variants: {
    label: "Source",
    options: [
      {
        id: "demo",
        label: "In-memory",
        description: "Deterministic provider, no API",
      },
      {
        // Historic id, kept so remembered variant selections stay valid.
        id: "staging",
        label: "Live API",
        description: "Client token against the Runtype API",
      },
    ],
    onSelect: (id) => {
      source = id as Source;
      remount();
    },
  },
});

const configInspector = createDemoConfigInspector({
  title: "Conversation History",
  alwaysShowKeys: ["apiUrl"],
});

const echoFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText) =>
    `You said “${userText}”. This reply is local: the in-memory history provider stands in for the Runtype visitor plane so every state below is deterministic.`,
});

// --- event log -------------------------------------------------------------

const logContainer = document.getElementById("history-log");

function log(kind: string, details: string): void {
  if (!logContainer) return;
  logContainer.querySelector(".empty-state")?.remove();
  const entry = document.createElement("div");
  entry.className = `log-entry ${kind}`;
  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = kind;
  title.appendChild(strong);
  const body = document.createElement("div");
  body.style.marginTop = "0.25rem";
  body.style.opacity = "0.7";
  body.textContent = details;
  const time = document.createElement("div");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });
  entry.append(title, body, time);
  logContainer.insertBefore(entry, logContainer.firstChild);
  while (logContainer.children.length > 60) {
    logContainer.removeChild(logContainer.lastChild!);
  }
}

const describeIdentity = (status: HistoryIdentityStatus): string =>
  "reason" in status ? `${status.state} (${status.reason})` : status.state;

// --- config ----------------------------------------------------------------

const liveUsable = Boolean(LIVE_CLIENT_TOKEN);

const threadRailPlugin = createThreadRailPlugin();

/**
 * Contributes one rail section through the plugin hook. A full
 * renderHistoryView replacement supersedes sections, so the two demo plugins
 * are mutually exclusive: this one runs while the custom view is off.
 */
const pinnedSectionPlugin = createPinnedSectionPlugin((label) =>
  log("info", `picked the pinned item ${label}`),
);

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const base: AgentWidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    features: { history: { enabled: true, presentation } },
    // Public hooks only: the plugin returns DOM, Persona keeps orchestration.
    // The rail section only shows in the rail presentation.
    plugins: [customView ? threadRailPlugin : pinnedSectionPlugin],
    // The page is about the Messages surface, so the transcript stays quiet.
    suggestionChips: [],
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: mode === "launcher",
      width: "100%",
    },
    welcome: {
      variant: "hero",
      dismiss: "on-first-message",
      title: "Messages",
      subtitle: "Open the history action in the header to browse conversations.",
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      inputPlaceholder: "Send a message…",
    },
  };
  if (source === "staging") {
    return {
      ...base,
      clientToken: LIVE_CLIENT_TOKEN,
      apiUrl: LIVE_API_URL,
      // The visitor credential is durable by design: with persistence off the
      // widget keeps history for this page load only.
      persistState: { keyPrefix: "persona-history-staging-" },
    };
  }
  return { ...base, persistState: false, customFetch: echoFetch };
};

// --- live-source guard ------------------------------------------------------

const addLine = (parent: HTMLElement, text: string, className?: string): void => {
  const node = document.createElement("p");
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
};

/** A missing client token renders instructions instead of a broken widget. */
function renderLiveSetup(stage: HTMLElement): () => void {
  stage.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "history-setup";
  const heading = document.createElement("h3");
  heading.textContent = "Set up the live API";
  panel.appendChild(heading);

  addLine(
    panel,
    "Add a client token with visitor history enabled to apps/web/.env and restart the dev server:",
  );
  const code = document.createElement("pre");
  code.className = "code-block";
  code.textContent =
    "VITE_CLIENT_TOKEN_HISTORY=ct_live_…\n# Optional, defaults to https://api.runtype.com:\n# VITE_HISTORY_API_URL=https://api.runtype-staging.com";
  panel.appendChild(code);

  addLine(
    panel,
    "Client tokens are origin-locked in the Runtype dashboard; allow http://localhost:5173 and http://localhost:4173 for local work.",
    "hint",
  );
  addLine(
    panel,
    "The in-memory source needs none of this and covers every state on this page.",
    "hint",
  );
  stage.appendChild(panel);
  return () => {
    stage.innerHTML = "";
  };
}

// --- mount -----------------------------------------------------------------

function wireEvents(controller: AgentWidgetController): () => void {
  const onOpened = (p: { presentation: string; returnSurface: string }) =>
    log("session", `opened as ${p.presentation}, returns to ${p.returnSurface}`);
  const onClosed = (p: { returnSurface: string }) =>
    log("info", `closed, returned to ${p.returnSurface}`);
  const onConversationOpened = (p: { conversationId: string }) =>
    log("answered", `opened ${p.conversationId}`);
  const onConversationStarted = (p: { conversationId: string | null }) =>
    log("answered", `started ${p.conversationId ?? "(no id)"}`);
  const onDeleted = (p: { conversationId: string; wasActive: boolean }) =>
    log(
      "dismissed",
      `deleted ${p.conversationId}${p.wasActive ? " (was active)" : ""}`,
    );
  const onCleared = (p: { deleted: number; targetId: string | null }) =>
    log(
      "dismissed",
      `cleared ${p.deleted} conversations, target ${p.targetId ?? "all"}`,
    );
  const onReset = (p: { remoteRevocationConfirmed: boolean }) =>
    log(
      "session",
      `identity reset, remote revocation ${
        p.remoteRevocationConfirmed ? "confirmed" : "unconfirmed"
      }`,
    );
  const onIdentity = (p: { status: HistoryIdentityStatus }) =>
    log("info", `identity status ${describeIdentity(p.status)}`);

  controller.on("history:opened", onOpened);
  controller.on("history:closed", onClosed);
  controller.on("history:conversationOpened", onConversationOpened);
  controller.on("history:conversationStarted", onConversationStarted);
  controller.on("history:conversationDeleted", onDeleted);
  controller.on("history:cleared", onCleared);
  controller.on("history:identityReset", onReset);
  controller.on("history:identityStatusChanged", onIdentity);

  return () => {
    controller.off("history:opened", onOpened);
    controller.off("history:closed", onClosed);
    controller.off("history:conversationOpened", onConversationOpened);
    controller.off("history:conversationStarted", onConversationStarted);
    controller.off("history:conversationDeleted", onDeleted);
    controller.off("history:cleared", onCleared);
    controller.off("history:identityReset", onReset);
    controller.off("history:identityStatusChanged", onIdentity);
  };
}

function remount(): void {
  if (!activeStage) return;
  teardownActive?.();
  teardownActive = null;
  activeController = null;

  const liveSelected = source === "staging";
  document
    .querySelectorAll<HTMLElement>("[data-history-demo-only]")
    .forEach((group) => {
      group.hidden = liveSelected;
    });

  if (liveSelected && !liveUsable) {
    setHistoryProviderFactory(null);
    teardownActive = renderLiveSetup(activeStage);
    log("error", "The live API is not configured; showing setup instructions.");
    return;
  }

  // The live source builds the real Runtype provider: clear the demo override.
  setHistoryProviderFactory(liveSelected ? null : () => provider);

  const mounted = runWidgetMountWithInspector(
    configInspector,
    "inline",
    activeStage,
    buildConfig,
  );
  activeController = mounted.controller;
  const unwire = wireEvents(mounted.controller);
  teardownActive = () => {
    unwire();
    mounted.teardown();
  };
  log(
    "session",
    `mounted ${liveSelected ? "live API" : "in-memory"} source, presentation ${presentation}, ${
      customView
        ? "custom renderHistoryView plugin"
        : "built-in Messages view with the pinned rail section plugin"
    }`,
  );
}

setupMountMode({
  slug: "history-demo",
  modes: ["inline"],
  mount: (_mode, { stage }) => {
    activeStage = stage;
    remount();
    return () => {
      teardownActive?.();
      teardownActive = null;
      activeController = null;
      activeStage = null;
    };
  },
});

// --- controls --------------------------------------------------------------

const on = (selector: string, handler: (el: HTMLElement) => void): void => {
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    element.addEventListener("click", () => handler(element));
  });
};

const presentationSelect =
  document.querySelector<HTMLSelectElement>("[data-history-presentation]");
presentationSelect?.addEventListener("change", () => {
  presentation = presentationSelect.value as Presentation;
  remount();
});

// Plugins are read at construction, so switching renderers is a remount.
document
  .querySelector<HTMLButtonElement>("[data-history-toggle='custom-view']")
  ?.addEventListener("click", (event) => {
    customView = !customView;
    (event.currentTarget as HTMLButtonElement).setAttribute(
      "aria-pressed",
      String(customView),
    );
    remount();
  });

on("[data-history-action='open']", () => {
  void activeController?.showHistory();
});
on("[data-history-action='close']", () => activeController?.hideHistory());
on("[data-history-action='new']", () => {
  void activeController
    ?.startNewConversation()
    .catch((error: unknown) => log("error", String(error)));
});

on("[data-history-identity]", (element) => {
  const state = element.dataset.historyIdentity ?? "";
  const reason = element.dataset.historyIdentityReason;
  provider.setIdentityStatus({
    state,
    ...(reason ? { reason } : {}),
  } as HistoryIdentityStatus);
  log("info", `injected identity status ${state}${reason ? ` (${reason})` : ""}`);
});

on("[data-history-latency]", (element) => {
  const ms = Number(element.dataset.historyLatency ?? 0);
  provider.setLatency(ms);
  log("info", `provider latency set to ${ms}ms`);
});

on("[data-history-fail]", (element) => {
  const operation = (element.dataset.historyFail ?? "list") as DemoHistoryOperation;
  const code = (element.dataset.historyCode ?? "unavailable") as HistoryProviderErrorCode;
  const retryAfter = element.dataset.historyRetryAfter;
  provider.failNext(operation, {
    code,
    ...(retryAfter ? { retryAfterSeconds: Number(retryAfter) } : {}),
  });
  log("info", `next ${operation} will fail with ${code}`);
});

on("[data-history-action='clear-failures']", () => {
  provider.clearFailures();
  provider.setLatency(0);
  log("info", "cleared injected failures and latency");
});

on("[data-history-action='delete-newest']", () => {
  const controller = activeController;
  if (!controller) return;
  void controller
    .listConversations({ limit: 1 })
    .then((page) => {
      const newest = page.items[0];
      if (!newest) {
        log("info", "nothing to delete");
        return;
      }
      return controller.deleteConversation(newest.id);
    })
    .catch((error: unknown) => log("error", String(error)));
});

on("[data-history-action='delete-all']", () => {
  void activeController
    ?.clearConversationHistory()
    .catch((error: unknown) => log("error", String(error)));
});

on("[data-history-action='reseed']", () => {
  provider = createDemoHistoryProvider();
  remount();
  log("info", "reseeded the in-memory provider");
});

// The demo provider deliberately omits `resetDevice`, so "Forget this device"
// never renders and the controller method rejects as misuse rather than
// pretending a browser credential was revoked.
on("[data-history-action='reset-identity']", () => {
  void activeController
    ?.resetHistoryIdentity()
    .then((result) =>
      log(
        "session",
        `reset resolved, remote revocation ${
          result.remoteRevocationConfirmed ? "confirmed" : "unconfirmed"
        }`,
      ),
    )
    .catch((error: unknown) =>
      log(
        "error",
        `resetHistoryIdentity rejected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
});

on("[data-history-action='status']", () => {
  const status = activeController?.getHistoryIdentityStatus();
  log("info", status ? `current status ${describeIdentity(status)}` : "no controller");
});

Object.defineProperty(window, "historyDemoController", {
  configurable: true,
  get: () => activeController,
});

void scaffold;
