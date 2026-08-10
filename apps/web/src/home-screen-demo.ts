import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type HistoryConversationSummary,
} from "@runtypelabs/persona";
// Source-only demo seam: the in-memory history provider is not part of the
// published package. Production builds the Runtype provider from client-token
// config instead (see the "Live staging" variant on the history states page).
import { setHistoryProviderFactory } from "@runtypelabs/persona/internal/history-provider-registry";
import { createDemoHistoryProvider } from "@runtypelabs/persona/internal/demo-history-provider";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import {
  createHomeScreenPlugin,
  type HomeScreenCard,
  type HomeScreenLink,
  type HomeScreenRecentConversation,
} from "./plugins/home-screen-plugin";

let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;
let showLinks = true;
let showCards = true;
let historyEnabled = true;
let recentLoaded = false;

const scaffold = renderDemoScaffold({
  slug: "home-screen-demo",
  title: "Home Screen Plugin",
  blurb:
    "An Intercom-style home stack built on renderWelcome and renderComposer, wired to the conversation history controller API: Home, Messages, and Conversation are three distinct surfaces.",
});

const configInspector = createDemoConfigInspector({
  title: "Home Screen",
});

// One store for the page, so switching mount mode or toggling history keeps the
// conversations the visitor already opened, deleted, or started.
const historyProvider = createDemoHistoryProvider();

// Verb-first, user-voice, single-line starters, each sampling a different
// capability. With `behavior: "send"` the label is the message that gets sent.
const STARTERS = [
  { id: "order", label: "Track my latest order", icon: "package" as const },
  { id: "returns", label: "Start a return", icon: "rotate-cw" as const },
  { id: "billing", label: "Explain a charge on my invoice", icon: "receipt" as const },
];

const CARDS: HomeScreenCard[] = [
  {
    id: "release",
    title: "Same-day delivery is live in 12 cities",
    body: "Orders placed before 2pm now arrive the same evening.",
    actionLabel: "Ask what changed",
    prompt: "What changed with same-day delivery?",
  },
  {
    id: "status",
    title: "All systems operational",
    body: "No incidents reported in the last 30 days.",
    actionLabel: "Open the status page",
    href: "https://persona-chat.dev/",
  },
];

const LINKS: HomeScreenLink[] = [
  {
    id: "docs",
    label: "Read the documentation",
    description: "Configuration, theming, and plugin hooks",
    href: "https://persona-chat.dev/",
  },
  {
    id: "status",
    label: "Check service status",
    description: "Live uptime and incident history",
    href: "https://persona-chat.dev/",
  },
  {
    id: "contact",
    label: "Email the support team",
    description: "We reply within one business day",
    href: "mailto:support@example.com",
  },
];

const homeScreenFetch = createDemoEchoFetch({
  chunkSize: 7,
  delayMs: 24,
  reply: (userText) =>
    `You asked “${userText}”. This mock reply streams through Persona’s normal text pipeline, so you can watch the home stack hand the panel back to the transcript.`,
});

// Rebuilt per mount so the plugin's `showHome` closure belongs to the widget
// instance the header action is wired to.
let homePlugin = createHomeScreenPlugin();

/** Server-owned fields only: the teaser never derives a title or preview. */
const toRecentRow = (
  summary: HistoryConversationSummary,
): HomeScreenRecentConversation => ({
  id: summary.id,
  title: summary.title,
  preview: summary.preview,
  updatedAt: summary.updatedAt,
});

/**
 * Home teaser refresh, through public controller methods only. A destructive or
 * continuity-changing event invalidates the rows immediately; an ordinary
 * refresh leaves them on screen because v1 does not promise live sync.
 */
const refreshRecent = async (opts?: { invalidate?: boolean }): Promise<void> => {
  const controller = activeController;
  if (!historyEnabled || !controller) return;
  if (opts?.invalidate || !recentLoaded) {
    homePlugin.update({
      recentStatus: "loading",
      ...(opts?.invalidate ? { recentConversations: [] } : {}),
    });
  }
  try {
    const page = await controller.listConversations({ limit: 3 });
    recentLoaded = true;
    homePlugin.update({
      recentStatus: "ready",
      recentConversations: page.items.map(toRecentRow),
    });
  } catch {
    recentLoaded = false;
    homePlugin.update({ recentStatus: "error", recentConversations: [] });
  }
};

const historyOptions = () =>
  historyEnabled
    ? {
        recentStatus: "loading" as const,
        recentConversations: [],
        onStartConversation: async () => {
          await activeController?.startNewConversation();
        },
        onOpenConversation: async (conversationId: string) => {
          await activeController?.openConversation(conversationId);
        },
        onShowConversations: async () => {
          // Messages records Home as its return surface, so back and Escape
          // land back on the stack rather than the transcript.
          await activeController?.showHistory({ returnSurface: "home" });
        },
        onRetryRecent: () => refreshRecent({ invalidate: true }),
        onConversationShown: () => {
          // The composer re-renders one microtask after the view flips.
          setTimeout(() => activeController?.focusInput(), 0);
        },
      }
    : {};

const currentOptions = () => ({
  avatar: { text: "🛍️" },
  starters: STARTERS,
  cards: showCards ? CARDS : [],
  links: showLinks ? LINKS : [],
  startHint: "We usually reply in a few minutes",
  ...historyOptions(),
});

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  homePlugin = createHomeScreenPlugin(currentOptions());
  return {
    ...DEFAULT_WIDGET_CONFIG,
    persistState: false,
    plugins: [homePlugin],
    customFetch: homeScreenFetch,
    // Panel presentation: Messages replaces the conversation surface, so the
    // composer is never reachable underneath it.
    features: {
      history: { enabled: historyEnabled, presentation: "panel" as const },
    },
    // The plugin owns the first screen; the hero is what the transcript falls
    // back to once the user leaves home before sending anything.
    welcome: {
      variant: "hero",
      dismiss: "on-first-message",
      title: "Hi, how can we help?",
      subtitle: "Ask about orders, returns, and billing.",
      icon: { type: "text", text: "🛍️" },
    },
    suggestions: {
      starters: {
        items: STARTERS,
        variant: "card",
        placement: "welcome",
        behavior: "send",
        maxItems: 3,
      },
    },
    layout: {
      header: {
        // Trailing actions render in the minimal header layout only.
        layout: "minimal",
        trailingActions: [homePlugin.headerAction],
        // Plugin content renders regardless of derived welcome visibility, so
        // the stack comes back over the transcript.
        onAction: (actionId: string) => {
          if (actionId === homePlugin.headerAction.id) {
            homePlugin.showHome();
            // Opening Home refreshes the teaser: v1 reconciles on open.
            void refreshRecent();
          }
        },
      },
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: mode === "launcher",
      width: mode === "launcher" ? "min(420px, 94vw)" : "100%",
      title: mode === "launcher" ? "Support" : undefined,
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      inputPlaceholder: "Ask about an order, return, or charge…",
    },
  };
};

/** Public events only: the demo never reads provider or session internals. */
function wireHistoryEvents(controller: AgentWidgetController): () => void {
  const refresh = () => void refreshRecent();
  const invalidate = () => void refreshRecent({ invalidate: true });

  // Back and Escape return to the invoking surface, which is Home here. A
  // committed selection or new conversation ALSO closes the panel, and those
  // must land on Conversation. The selection is observable as an event; an
  // in-panel new conversation is observable as a transcript change.
  const transcriptKey = () =>
    controller
      .getMessages()
      .map((message) => message.id)
      .join("|");
  let transcriptOnOpen: string | null = null;
  let committedWhileOpen = false;

  const onPanelOpened = () => {
    transcriptOnOpen = transcriptKey();
    committedWhileOpen = false;
  };
  const onOpened = () => {
    committedWhileOpen = true;
    homePlugin.showConversation();
    refresh();
  };
  const onClosed = (payload: { returnSurface: string }) => {
    const committed =
      committedWhileOpen ||
      (transcriptOnOpen !== null && transcriptOnOpen !== transcriptKey());
    transcriptOnOpen = null;
    committedWhileOpen = false;
    if (committed || payload.returnSurface !== "home") return;
    homePlugin.showHome();
    refresh();
  };

  controller.on("history:opened", onPanelOpened);
  controller.on("history:conversationOpened", onOpened);
  controller.on("history:closed", onClosed);
  controller.on("history:conversationDeleted", invalidate);
  controller.on("history:cleared", invalidate);
  controller.on("history:identityReset", invalidate);
  controller.on("history:identityStatusChanged", refresh);

  return () => {
    controller.off("history:opened", onPanelOpened);
    controller.off("history:conversationOpened", onOpened);
    controller.off("history:closed", onClosed);
    controller.off("history:conversationDeleted", invalidate);
    controller.off("history:cleared", invalidate);
    controller.off("history:identityReset", invalidate);
    controller.off("history:identityStatusChanged", refresh);
  };
}

function remount(): void {
  if (!activeStage) return;
  teardownActive?.();
  setHistoryProviderFactory(historyEnabled ? () => historyProvider : null);
  recentLoaded = false;
  const mounted = runWidgetMountWithInspector(
    configInspector,
    activeMode,
    activeStage,
    buildConfig,
  );
  activeController = mounted.controller;
  const unwire = historyEnabled ? wireHistoryEvents(mounted.controller) : null;
  teardownActive = () => {
    unwire?.();
    mounted.teardown();
  };
  void refreshRecent();
}

setupMountMode({
  slug: "home-screen-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
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

const setPressed = (selector: string, pressed: boolean): void => {
  document
    .querySelectorAll<HTMLButtonElement>(selector)
    .forEach((button) => button.setAttribute("aria-pressed", String(pressed)));
};

// Plugin options are read at render time, so `update()` re-renders the stack
// in place: no remount, same view state.
document
  .querySelector<HTMLButtonElement>("[data-home-toggle='links']")
  ?.addEventListener("click", () => {
    showLinks = !showLinks;
    setPressed("[data-home-toggle='links']", showLinks);
    homePlugin.update({ links: showLinks ? LINKS : [] });
  });

document
  .querySelector<HTMLButtonElement>("[data-home-toggle='cards']")
  ?.addEventListener("click", () => {
    showCards = !showCards;
    setPressed("[data-home-toggle='cards']", showCards);
    homePlugin.update({ cards: showCards ? CARDS : [] });
  });

// History changes the widget's feature config and the plugin composition, so
// this one remounts. With it off, the stack is the original blueprint: no
// recent section, and "Start a conversation" just leaves home.
document
  .querySelector<HTMLButtonElement>("[data-home-toggle='history']")
  ?.addEventListener("click", () => {
    historyEnabled = !historyEnabled;
    setPressed("[data-home-toggle='history']", historyEnabled);
    remount();
  });

document
  .querySelector<HTMLButtonElement>("[data-home-action='show']")
  ?.addEventListener("click", () => {
    homePlugin.showHome();
    void refreshRecent();
  });

document
  .querySelector<HTMLButtonElement>("[data-home-action='messages']")
  ?.addEventListener("click", () => {
    void activeController?.showHistory({ returnSurface: "home" });
  });

document
  .querySelector<HTMLButtonElement>("[data-home-action='new']")
  ?.addEventListener("click", () => {
    void activeController?.startNewConversation().then(() => {
      homePlugin.showConversation();
      void refreshRecent();
    });
  });

// `controller.update()` re-runs welcome arbitration, so the plugin's greeting
// header picks up the new resolved config without a remount.
document
  .querySelector<HTMLButtonElement>("[data-home-action='rename']")
  ?.addEventListener("click", () => {
    activeController?.update({
      welcome: { title: "Welcome back, Ada", variant: "hero" },
    });
  });

// Keep the value live for the browser console while exploring the demo.
Object.defineProperty(window, "homeScreenDemoController", {
  configurable: true,
  get: () => activeController,
});

// Console handle for the teaser's pending and error states, e.g.
// `homeScreenDemoHistory.failNext("list", { code: "unavailable" })` followed by
// the "Back to home" control. The full state matrix lives on the history page.
Object.defineProperty(window, "homeScreenDemoHistory", {
  configurable: true,
  get: () => historyProvider,
});

void scaffold;
