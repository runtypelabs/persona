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
  createHelpSearchPlugin,
  createStaticArticleSearch,
  type HelpSearchArticle,
  type HelpSearchPlugin,
} from "./plugins/help-search-plugin";

type WelcomeMode = "card" | "hero";
type ResultAction = "open" | "ask";
type StarterMode = "static" | "promote";

let welcomeMode: WelcomeMode = "card";
let resultAction: ResultAction = "open";
let starterMode: StarterMode = "static";
let activeMode: Mode = "inline";
let activeStage: HTMLElement | null = null;
let activeController: AgentWidgetController | null = null;
let teardownActive: (() => void) | null = null;

const scaffold = renderDemoScaffold({
  slug: "help-search-demo",
  title: "Help Search Plugin",
  blurb:
    "A renderWelcome plugin that composes a debounced help-center search into the default welcome surface.",
});

const configInspector = createDemoConfigInspector({
  title: "Help Search",
});

// Stands in for a help-center API. A real host swaps `search` for Zendesk
// Guide, Algolia, or its own endpoint; nothing else about the plugin changes.
const ARTICLES: HelpSearchArticle[] = [
  {
    id: "install",
    title: "Install the widget with a script tag",
    url: "https://persona-chat.dev/",
    summary: "One installer script and a config object on the page.",
    section: "Getting started",
  },
  {
    id: "theming",
    title: "Theme the widget with design tokens",
    url: "https://persona-chat.dev/layout-config-demo.html",
    summary: "Colors, radius, and typography come from CSS custom properties.",
    section: "Theming",
  },
  {
    id: "suggestions",
    title: "Configure starter prompts",
    url: "https://persona-chat.dev/suggestions-demo.html",
    summary: "Rich starters, placement, and the suggestion plugin hooks.",
    section: "Welcome",
  },
  {
    id: "uploads",
    title: "Let visitors upload files",
    url: "https://persona-chat.dev/attachments-demo.html",
    summary: "Enable attachments and set the accepted types.",
    section: "Composer",
  },
  {
    id: "launcher",
    title: "Move or restyle the launcher",
    url: "https://persona-chat.dev/launcher-demo.html",
    summary: "Position, size, and copy for the collapsed launcher.",
    section: "Launcher",
  },
  {
    id: "billing",
    title: "Update billing details",
    url: "https://persona-chat.dev/",
    summary: "Change the card on file or download past invoices.",
    section: "Billing",
  },
  {
    id: "seats",
    title: "Add teammates to a workspace",
    url: "https://persona-chat.dev/",
    summary: "Invite, remove, and change roles for workspace members.",
    section: "Billing",
  },
];

const helpSearchFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText) =>
    `You asked: “${userText}”. A real agent would answer from the linked help article; this mock reply streams through Persona's normal text pipeline.`,
});

// Rebuilt per mount so `focusSearch` and `attach` belong to the widget instance
// the header action is wired to.
let helpSearch: HelpSearchPlugin | null = null;

const welcomeForMode = (): AgentWidgetConfig["welcome"] => {
  const base = {
    title: "How can we help?",
    subtitle: "Search the help center or ask a question in your own words.",
  };
  if (welcomeMode === "hero") {
    return {
      ...base,
      variant: "hero",
      icon: { type: "lucide", name: "message-circle" },
    };
  }
  // Explicit undefined resets the field on a live update; omitting it would
  // leave the previous hero variant and icon merged in.
  return { ...base, variant: undefined, icon: undefined };
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  helpSearch = createHelpSearchPlugin({
    search: createStaticArticleSearch(ARTICLES),
    resultAction,
    promoteResultsToStarters: starterMode === "promote",
    placeholder: "Search help articles…",
  });

  return {
    ...DEFAULT_WIDGET_CONFIG,
    persistState: false,
    plugins: [helpSearch],
    suggestions: {
      starters: {
        items: [
          { id: "order", label: "Where is my order?", icon: "package" },
          { id: "refund", label: "Start a refund", icon: "receipt" },
          { id: "seat", label: "Add a teammate to my plan", icon: "user" },
        ],
        variant: "card",
        placement: "welcome",
        behavior: "send",
        maxItems: 3,
      },
    },
    customFetch: helpSearchFetch,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: mode === "launcher",
      width: mode === "launcher" ? "min(440px, 94vw)" : "100%",
      title: "Help center",
    },
    welcome: welcomeForMode(),
    layout: {
      header: {
        layout: "minimal",
        trailingActions: [
          { id: "search", icon: "search", ariaLabel: "Search help articles" },
        ],
        onAction: (actionId: string) => {
          if (actionId === "search") helpSearch?.focusSearch();
        },
      },
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      inputPlaceholder: "Ask a question…",
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
  // Host-closure controller pattern: the plugin is built before the widget and
  // handed the controller afterwards.
  helpSearch?.attach(mounted.controller);
}

setupMountMode({
  slug: "help-search-demo",
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

const setPressed = (selector: string, attribute: string, value: string): void => {
  document
    .querySelectorAll<HTMLButtonElement>(selector)
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        button.dataset[attribute] === value ? "true" : "false",
      ),
    );
};

document
  .querySelectorAll<HTMLButtonElement>(".help-search-welcome-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.welcome as WelcomeMode | undefined;
      if (!next || next === welcomeMode) return;
      welcomeMode = next;
      setPressed(".help-search-welcome-button", "welcome", welcomeMode);
      // Live update, no remount: welcome arbitration re-runs, the plugin's
      // cleanup drops the old card, and the query survives in the closure.
      activeController?.update({ welcome: welcomeForMode() });
    });
  });

document
  .querySelectorAll<HTMLButtonElement>(".help-search-action-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.action as ResultAction | undefined;
      if (!next || next === resultAction) return;
      resultAction = next;
      setPressed(".help-search-action-button", "action", resultAction);
      remount();
    });
  });

document
  .querySelectorAll<HTMLButtonElement>(".help-search-starters-button")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.starters as StarterMode | undefined;
      if (!next || next === starterMode) return;
      starterMode = next;
      setPressed(".help-search-starters-button", "starters", starterMode);
      remount();
    });
  });

// Keep the value live for the browser console while exploring the demo.
Object.defineProperty(window, "helpSearchDemoController", {
  configurable: true,
  get: () => activeController,
});

void scaffold;
