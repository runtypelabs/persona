import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";

import { createDemoConfigInspector } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import {
  createHomeScreenPlugin,
  type HomeScreenCard,
  type HomeScreenLink,
} from "./plugins/home-screen-plugin";

let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;
let showLinks = true;
let showCards = true;

const scaffold = renderDemoScaffold({
  slug: "home-screen-demo",
  title: "Home Screen Plugin",
  blurb:
    "An Intercom-style home stack built on renderWelcome, with a header action that returns to it over an existing conversation.",
});

const configInspector = createDemoConfigInspector({
  title: "Home Screen",
});

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

const currentOptions = () => ({
  avatar: { text: "🛍️" },
  starters: STARTERS,
  cards: showCards ? CARDS : [],
  links: showLinks ? LINKS : [],
  startHint: "We usually reply in a few minutes",
});

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  homePlugin = createHomeScreenPlugin(currentOptions());
  return {
    ...DEFAULT_WIDGET_CONFIG,
    persistState: false,
    plugins: [homePlugin],
    customFetch: homeScreenFetch,
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
          if (actionId === homePlugin.headerAction.id) homePlugin.showHome();
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

function remount(): void {
  if (!activeStage) return;
  teardownActive?.();
  const mounted = runWidgetMountWithInspector(
    configInspector,
    activeMode,
    activeStage,
    buildConfig,
  );
  activeController = mounted.controller;
  teardownActive = mounted.teardown;
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

document
  .querySelector<HTMLButtonElement>("[data-home-action='show']")
  ?.addEventListener("click", () => homePlugin.showHome());

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

void scaffold;
