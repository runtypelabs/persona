import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetMessage,
  type AgentWidgetScrollMode,
} from "@runtypelabs/persona";
import { squareInlinePanel } from "./mount-mode";
import { editorialWidgetTheme } from "./editorial-widget-theme";
import { createTweetEmbedPlugin } from "./plugins/tweet-embed-plugin";
import { createDemoEchoFetch } from "./demo-echo-fetch";

// No live backend (this is a scroll-behavior testbed). A typed message streams
// back a long, multi-paragraph echo so the scroll modes, pin-on-interaction,
// and last-turn restore all have real content to work against instead of
// erroring on a dead apiUrl.
const echoFetch = createDemoEchoFetch({
  reply: (userText) => {
    const quoted = userText ? `"${userText}"` : "your message";
    const para = (n: number) =>
      `Paragraph ${n}. This is filler streamed token by token so the scroll engine has something to chew on: anchor-top pinning, pause-on-interaction, and last-user-turn restore all key off a growing assistant bubble like this one. Scroll up mid-stream to confirm the view stays where you left it.`;
    return [
      `Echoing ${quoted} back. There is no model behind this demo, so the text below is canned, but it streams through the exact same pipeline a real agent drives.`,
      "",
      para(1),
      "",
      para(2),
      "",
      para(3),
    ].join("\n");
  },
});

// ── toggle state ────────────────────────────────────────────────

type ScrollOptions = {
  mode: AgentWidgetScrollMode;
  pauseOnInteraction: boolean;
  showActivityWhilePinned: boolean;
  announce: boolean;
  restoreLastUserTurn: boolean;
};

const options: ScrollOptions = {
  mode: "anchor-top",
  pauseOnInteraction: true,
  showActivityWhilePinned: true,
  announce: true,
  restoreLastUserTurn: true,
};

// ── Tweet embed plugin (see src/plugins/tweet-embed-plugin.ts) ───
// A self-contained, reusable embed module: registers a `Tweet` component that
// renders a height-reserving skeleton and swaps in the real X embed once it
// hydrates. Demonstrates the pattern for any async third-party embed.

const TWEET_URL = "https://twitter.com/shadcn/status/2070394918720221522";
const tweetEmbed = createTweetEmbedPlugin({ reservedHeightPx: 440, theme: "auto" });

// ── widget config (additive opt-in only; defaults untouched) ─────

function buildConfig(inline: boolean): AgentWidgetConfig {
  const base: AgentWidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://noop.test/chat",
    customFetch: echoFetch,
    // Match the site's editorial/terminal design (paper surfaces, square
    // corners, ink text, teal accents) so the embedded widget reads identically
    // to the home page rail. Same source of truth as main.ts.
    theme: editorialWidgetTheme,
    // Inline (desktop column) hides the widget's own header so the panel is a
    // clean paper surface, exactly like the home page rail. The floating
    // launcher (narrow viewport) keeps its header — with the "Scroll
    // Engineering" title below — like the home page's mobile launcher.
    layout: inline ? { showHeader: false } : undefined,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: !inline,
      autoExpand: false,
      width: inline ? "100%" : "min(420px, 95vw)",
      position: "bottom-right",
      title: inline ? undefined : "Scroll Engineering",
    },
    suggestionChips: [],
    persistState: false,
    components: tweetEmbed.components,
    wrapComponentDirectiveInBubble: false,
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      toolCallDisplay: { collapsedMode: "tool-name", activePreview: true },
      reasoningDisplay: { activePreview: true },
      scrollBehavior: {
        mode: options.mode,
        // Additive, opt-in. Each defaults to historical behavior in the widget;
        // we set them explicitly so the demo toggles are authoritative.
        pauseOnInteraction: options.pauseOnInteraction,
        showActivityWhilePinned: options.showActivityWhilePinned,
        announce: options.announce,
        restorePosition: options.restoreLastUserTurn ? "last-user-turn" : "bottom",
      },
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Scroll Engineering",
      welcomeSubtitle:
        "Run a scenario from the rail, or type here. Try scrolling up, selecting text, or pressing PageUp while a reply streams.",
    },
  };
  return inline ? squareInlinePanel(base) : base;
}

// ── responsive mount: inline column (desktop) vs floating pill (narrow) ──

const widgetCol = document.getElementById("se-widget-col")!;
const widgetHost = document.getElementById("se-widget-host")!;
const launcherRoot = document.getElementById("se-launcher-root")!;
const INLINE_MQ = window.matchMedia("(min-width: 1180px)");

let controller: AgentWidgetController;
let inlineMode = INLINE_MQ.matches;

function mountWidget(inline: boolean, initialMessages?: AgentWidgetMessage[]) {
  inlineMode = inline;
  const config: AgentWidgetConfig = initialMessages?.length
    ? { ...buildConfig(inline), initialMessages }
    : buildConfig(inline);

  if (inline) {
    launcherRoot.innerHTML = "";
    widgetCol.hidden = false;
    widgetHost.innerHTML = "";
    widgetHost.style.height = "100%";
    controller = createAgentExperience(widgetHost, config);
  } else {
    widgetCol.hidden = true;
    widgetHost.innerHTML = "";
    launcherRoot.innerHTML = "";
    controller = createAgentExperience(launcherRoot, config);
  }
}

mountWidget(inlineMode);

// Re-mount on breakpoint crossing, preserving the transcript.
INLINE_MQ.addEventListener("change", (e) => {
  if (e.matches === inlineMode) return;
  const messages = controller.getMessages();
  controller.destroy();
  mountWidget(e.matches, messages);
  log(`Viewport ${e.matches ? "≥1180px → inline widget column" : "narrow → floating pill"}.`, "info");
});

function applyConfig() {
  controller.update(buildConfig(inlineMode));
  renderPrinciples();
}

// ── helpers ─────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cancelToken = { cancelled: false };
function freshCancel() {
  cancelToken.cancelled = true;
  cancelToken = { cancelled: false };
  return cancelToken;
}

const logEl = document.getElementById("log")!;
function log(msg: string, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

let msgCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++msgCounter}`;

const el = (tag: string, className?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

// ── principle checklist ─────────────────────────────────────────

type Principle = { name: string; cfg: () => string; on: () => boolean };

const PRINCIPLES: Principle[] = [
  { name: "Move only when asked", cfg: () => "follow-state machine", on: () => true },
  { name: "Follow only while following", cfg: () => "auto-follow pause/resume", on: () => true },
  {
    name: "Every interaction is intent",
    cfg: () => (options.pauseOnInteraction ? "selection + keyboard + links" : "selection + wheel only"),
    on: () => options.pauseOnInteraction,
  },
  { name: "Start a new turn near the top", cfg: () => `mode: ${options.mode}`, on: () => options.mode === "anchor-top" },
  { name: "Then stream into the space", cfg: () => "shrink-only spacer", on: () => options.mode === "anchor-top" },
  {
    name: "Keep previous turn in context",
    cfg: () => (options.mode === "anchor-top" ? "anchorTopOffset" : "n/a in follow"),
    on: () => options.mode === "anchor-top",
  },
  { name: "Let new content arrive offscreen", cfg: () => "paused = no viewport move", on: () => true },
  {
    name: "Show what's happening out of view",
    cfg: () => (options.showActivityWhilePinned ? "streaming pill + new count" : "follow-mode count only"),
    on: () => options.showActivityWhilePinned || options.mode !== "anchor-top",
  },
  { name: "Easy to return to latest", cfg: () => "scrollToBottom affordance", on: () => true },
  {
    name: "Jump anywhere",
    cfg: () => "unread count + jump-to-latest + reopen anchor",
    on: () => options.restoreLastUserTurn,
  },
  {
    name: "Reopen where you left off",
    cfg: () => `restorePosition: ${options.restoreLastUserTurn ? "last-user-turn" : "bottom"}`,
    on: () => options.restoreLastUserTurn,
  },
  { name: "Keep place on layout change", cfg: () => "ResizeObserver + spacer + tweet skeleton", on: () => true },
  { name: "Interruptions don't steal position", cfg: () => "stop respects pause", on: () => true },
  { name: "Responsive in long threads", cfg: () => "fingerprint render cache", on: () => true },
  {
    name: "Accessible without the noise",
    cfg: () => (options.announce ? "aria-live polite (debounced)" : "aria-labels only"),
    on: () => options.announce,
  },
];

const principleListEl = document.getElementById("principle-list")!;
function renderPrinciples() {
  principleListEl.innerHTML = "";
  for (const p of PRINCIPLES) {
    const li = document.createElement("li");
    li.dataset.on = String(p.on());
    const name = el("span", "pname");
    name.textContent = p.name;
    const cfg = el("div", "pcfg");
    cfg.textContent = p.cfg();
    const text = document.createElement("div");
    text.append(name, document.createElement("br"), cfg);
    li.appendChild(text);
    principleListEl.appendChild(li);
  }
}

// ── controls ────────────────────────────────────────────────────

const modeSelect = document.getElementById("scroll-mode") as HTMLSelectElement;
modeSelect.addEventListener("change", () => {
  options.mode = modeSelect.value as AgentWidgetScrollMode;
  applyConfig();
  log(`Scroll mode → ${options.mode}`, "info");
  if (options.mode === "anchor-top") {
    log("Send or stream: the sent message pins near the top while the reply grows below.", "info");
  }
});

function bindToggle(id: string, key: keyof ScrollOptions, label: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  input.addEventListener("change", () => {
    (options[key] as boolean) = input.checked;
    applyConfig();
    log(`${label} → ${input.checked ? "on" : "off"}`, "info");
  });
}
bindToggle("opt-pause-interaction", "pauseOnInteraction", "pauseOnInteraction");
bindToggle("opt-activity-pinned", "showActivityWhilePinned", "showActivityWhilePinned");
bindToggle("opt-announce", "announce", "announce");
bindToggle("opt-restore", "restoreLastUserTurn", "restorePosition");

// ── follow-state monitor ────────────────────────────────────────

const statusEl = document.getElementById("follow-status")!;
function findScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#persona-scroll-container");
}
function pollFollowState() {
  const dot = statusEl.querySelector(".status-dot")!;
  const label = statusEl.querySelector("span:last-child")!;
  const sc = findScrollContainer();
  if (!sc || sc.clientHeight === 0) {
    dot.className = "status-dot idle";
    label.textContent = inlineMode ? "Run a scenario to see scroll state" : "Open the pill to see scroll state";
    requestAnimationFrame(pollFollowState);
    return;
  }
  const atBottom = sc.scrollHeight - sc.clientHeight - sc.scrollTop < 24;
  if (atBottom) {
    dot.className = "status-dot following";
    label.textContent = "At the live edge — following";
  } else {
    dot.className = "status-dot paused";
    label.textContent = "Scrolled away — follow paused";
  }
  requestAnimationFrame(pollFollowState);
}
requestAnimationFrame(pollFollowState);

// ── content generators ──────────────────────────────────────────

const USER_MESSAGES = [
  "Can you walk me through setting up the project?",
  "What are the pricing tiers?",
  "Show me a code example for the retry logic.",
  "How does the streaming protocol work?",
  "Thanks — one more: do you support SSO?",
];

const SHORT_REPLIES = [
  "Absolutely — here's the short version.",
  "Good question. Let me lay it out.",
  "Sure thing, here you go.",
  "Happy to help with that.",
];

const LONG_REPLY_PART_1 = `Let's walk through the whole thing end to end — there's a fair amount to cover, so settle in.

First, the setup. Make sure you're on Node 20 or newer (\`node --version\`), install dependencies, and start the dev server. The widget mounts into any element you give it and streams responses over SSE, parsing partial JSON as it arrives so structured output renders incrementally instead of popping in all at once.

Now the part that actually matters for reading: **the scroll contract**. While a response streams, the transcript only chases the bottom *if you're already at the live edge*. The instant you scroll up — or select text, or press PageUp — it leaves you exactly where you are. New content keeps arriving offscreen below; nothing under your eyes moves.

This is the whole philosophy in one line: never move the reader against their intent. Auto-scroll is a privilege the reader grants by staying at the bottom, not a default the UI imposes. Everything else — the anchor-top mode, the jump-to-latest pill, the unread count, the reopen position — falls out of taking that one rule seriously.

Here's where the idea came from, and it's worth reading in full:`;

const LONG_REPLY_PART_2 = `So, continuing — a few consequences of that contract worth calling out:

When you send a new message, that's an unambiguous "take me to the latest" signal, so follow resumes and the view snaps down. But a *streamed* token is not that signal — it should never yank you. Anchor-top mode takes this further: it pins your just-sent question near the top and lets the answer grow into the space below, so you read the reply from its beginning instead of chasing its tail.

Layout shifts are the sneaky part. Images load late, code blocks reflow, markdown tables expand, embeds (like the post above!) hydrate a beat after they mount. None of that should cost you your place — a shrink-only spacer, a ResizeObserver, and a height-reserving skeleton for the embed keep the anchor fixed while content fills in.

And when you come back tomorrow, a saved conversation should reopen at the last thing *you* said — the last meaningful turn — not slammed to the absolute bottom of a thousand-message history. Small thing; huge difference in whether the thread feels navigable.

That's the tour. Scroll up through this reply: notice the page never fought you while you read.`;

const MIXED = `## Search results

1. **Starter** — $0/mo
   - 5 seats, community support
2. **Pro** — $49/mo
   - 50 seats, email support
3. **Enterprise** — custom
   - SSO, dedicated support

\`\`\`ts
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; }
  }
  throw last;
}
\`\`\`

> Prices are illustrative.`;

const LATE_IMAGE_SRC = "/autoscroll-late-image.jpg";

function setScenarioButtons(disabled: boolean) {
  document.querySelectorAll<HTMLButtonElement>(".btn-row .btn").forEach((b) => {
    if (b.id !== "btn-cancel" && b.id !== "btn-reset") b.disabled = disabled;
  });
}

async function streamAssistant(token: { cancelled: boolean }, id: string, text: string, delay = 16) {
  const words = text.split(/(\s+)/);
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    if (token.cancelled) return;
    acc += words[i];
    controller.injectAssistantMessage({ id, content: acc, streaming: true });
    if (words[i].trim()) await sleep(delay);
  }
  if (!token.cancelled) controller.injectAssistantMessage({ id, content: acc, streaming: false });
}

function seedConversation() {
  for (let i = 0; i < 4; i++) {
    controller.injectUserMessage({ id: nextId("u"), content: USER_MESSAGES[i] });
    controller.injectAssistantMessage({
      id: nextId("a"),
      content: SHORT_REPLIES[i % SHORT_REPLIES.length] + " " + LONG_REPLY_PART_1.split("\n\n")[0],
      streaming: false,
    });
  }
  log("Seeded a 4-turn conversation.", "info");
}

async function run(label: string, fn: (token: { cancelled: boolean }) => Promise<void>) {
  const token = freshCancel();
  setScenarioButtons(true);
  log(`▶ ${label}`, "info");
  try {
    await fn(token);
  } finally {
    if (!token.cancelled) log(`✓ ${label} done`);
    setScenarioButtons(false);
  }
}

document.getElementById("btn-seed")!.addEventListener("click", () => seedConversation());

document.getElementById("btn-stream")!.addEventListener("click", () =>
  run("Long reply + tweet embed", async (token) => {
    controller.injectUserMessage({ id: nextId("u"), content: "Explain your whole scroll philosophy." });
    await sleep(120);
    await streamAssistant(token, nextId("a"), LONG_REPLY_PART_1, 14);
    if (token.cancelled) return;
    tweetEmbed.inject(controller, { url: TWEET_URL });
    log("Tweet card injected — skeleton reserves ~440px, then swaps in place (P12).", "info");
    await sleep(400);
    if (token.cancelled) return;
    await streamAssistant(token, nextId("a"), LONG_REPLY_PART_2, 14);
  }),
);

document.getElementById("btn-rapid")!.addEventListener("click", () =>
  run("Rapid messages", async (token) => {
    for (let i = 0; i < 12; i++) {
      if (token.cancelled) return;
      if (i % 2 === 0) controller.injectUserMessage({ id: nextId("u"), content: `Rapid message ${i + 1}` });
      else controller.injectAssistantMessage({ id: nextId("a"), content: `Reply ${i + 1}`, streaming: false });
      await sleep(140);
    }
  }),
);

document.getElementById("btn-mixed")!.addEventListener("click", () =>
  run("Mixed content", async (token) => {
    controller.injectUserMessage({ id: nextId("u"), content: USER_MESSAGES[2] });
    await sleep(120);
    await streamAssistant(token, nextId("a"), MIXED, 10);
  }),
);

document.getElementById("btn-image")!.addEventListener("click", () =>
  run("Late image load", async (token) => {
    controller.injectUserMessage({ id: nextId("u"), content: "Show me the diagram." });
    await sleep(120);
    const id = nextId("a");
    await streamAssistant(token, id, "Here's the diagram — it loads a moment after the text:", 14);
    if (token.cancelled) return;
    controller.injectAssistantMessage({
      id,
      content: `Here's the diagram — it loads a moment after the text:\n\n![diagram](${LATE_IMAGE_SRC})`,
      streaming: false,
    });
    log("Image injected — watch the pin hold as it loads (P12).", "info");
  }),
);

document.getElementById("btn-reopen")!.addEventListener("click", () => {
  const messages: AgentWidgetMessage[] = controller.getMessages();
  if (messages.length < 2) {
    log("Seed or stream a conversation first, then Reopen.", "warn");
    return;
  }
  controller.destroy();
  mountWidget(inlineMode, messages);
  if (!inlineMode) controller.open();
  log(
    options.restoreLastUserTurn
      ? "Reopened → restorePosition:last-user-turn pins the last user message near the top."
      : "Reopened → restorePosition:bottom jumps to the very end.",
    "info",
  );
});

document.getElementById("btn-cancel")!.addEventListener("click", () => {
  freshCancel();
  setScenarioButtons(false);
  log("Cancelled running scenario.", "warn");
});

document.getElementById("btn-reset")!.addEventListener("click", () => {
  freshCancel();
  controller.clearChat();
  msgCounter = 0;
  log("Session reset.", "warn");
});

renderPrinciples();
log("Ready. Run a scenario from the rail.", "info");
