/**
 * Scroll follow-ups — before / after.
 * ---------------------------------------------------------------------------
 * Two Persona widgets mounted side by side and driven by the *same* scripted
 * conversation, so the four follow-ups from shadcn's chat-components thread are
 * visible as a direct contrast:
 *   - Before: today's widget defaults.
 *   - After:  features.scrollBehavior.edgeFade + visibilityTracking, plus
 *             features.messageEntrance, plus controller.scrollToMessage().
 * The focus toggles flip each feature on the After panel only (via
 * controller.update), so you can isolate one difference at a time.
 */

import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { squareInlinePanel } from "./mount-mode";
import { editorialWidgetTheme } from "./editorial-widget-theme";
import { createTweetEmbedPlugin } from "./plugins/tweet-embed-plugin";

// ── focus state (After panel only) ──────────────────────────────────────────

const focus = { edge: true, entrance: true, visible: true };

// Shared embed module: a height-reserving skeleton (now using the widget's
// `persona-shimmer-skeleton` utility) that swaps in the real X post.
const TWEET_URL = "https://twitter.com/shadcn/status/2070561306038653247";
const tweetEmbed = createTweetEmbedPlugin({ reservedHeightPx: 360, theme: "auto" });

// ── config ──────────────────────────────────────────────────────────────────

function buildConfig(enhanced: boolean): AgentWidgetConfig {
  const base: AgentWidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://noop.test/chat",
    theme: editorialWidgetTheme,
    layout: { showHeader: false },
    launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, autoExpand: false, width: "100%" },
    suggestionChips: [],
    persistState: false,
    components: tweetEmbed.components,
    wrapComponentDirectiveInBubble: false,
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      scrollBehavior: {
        mode: "anchor-top",
        showActivityWhilePinned: true,
        // The follow-ups, applied to the After panel only.
        ...(enhanced
          ? {
              edgeFade: focus.edge ? "both" : false,
              visibilityTracking: focus.visible,
            }
          : {}),
      },
      ...(enhanced
        ? { messageEntrance: { enabled: focus.entrance, mode: "slide-up" } }
        : {}),
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: enhanced ? "After" : "Before",
      welcomeSubtitle: "Run a scenario from the rail, or scroll this transcript.",
    },
  };
  return squareInlinePanel(base);
}

// ── mount both widgets ───────────────────────────────────────────────────────

const before: AgentWidgetController = createAgentExperience(
  document.getElementById("sf-host-before")!,
  buildConfig(false),
);
const after: AgentWidgetController = createAgentExperience(
  document.getElementById("sf-host-after")!,
  buildConfig(true),
);
const both = [before, after];

// ── visibility tracking readout (After panel) ────────────────────────────────

const seenIds = new Set<string>();
const seenEl = document.getElementById("sf-seen-after")!;
after.on("message:visible", (message) => {
  if (seenIds.has(message.id)) return;
  seenIds.add(message.id);
  seenEl.innerHTML = `seen: <b>${seenIds.size}</b>`;
  const preview =
    typeof message.content === "string" ? message.content.slice(0, 28) : "";
  log(`message:visible — ${message.role} ${message.id}${preview ? ` · "${preview}…"` : ""}`);
});

// ── log ───────────────────────────────────────────────────────────────────────

const logEl = document.getElementById("sf-log")!;
function log(msg: string, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ── content ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cancelToken = { cancelled: false };
function freshCancel() {
  cancelToken.cancelled = true;
  cancelToken = { cancelled: false };
  return cancelToken;
}

let counter = 0;
const nextId = (p: string) => `${p}-${++counter}`;

const SEED_TURNS: Array<[string, string]> = [
  ["Can you walk me through setup?", "Sure — Node 20+, install deps, start the dev server."],
  ["What are the pricing tiers?", "Starter is free, Pro is $49/mo, Enterprise is custom."],
  ["Show me the retry helper.", "Here's a tiny withRetry() wrapper you can drop in."],
];

const LONG_PART_1 = `Let's walk through the whole thing end to end — settle in.

While a response streams, the transcript only chases the bottom *if you're already at the live edge*. Scroll up — or select text, or press PageUp — and it leaves you exactly where you are. The reader is never moved against their intent.

Here's the post the idea came from:`;

const LONG_PART_2 = `A few consequences worth calling out:

Sending a new message is an unambiguous "take me to the latest"; a streamed token is not. Anchor-top mode pins your question near the top and grows the answer into the space below, so you read the reply from its beginning.

Layout shifts are the sneaky part — images, code blocks, late embeds. A shrink-only spacer plus a height-reserving skeleton keeps your place while content fills in.`;

const MIXED = `## Tiers
1. **Starter** — $0/mo
2. **Pro** — $49/mo
3. **Enterprise** — custom

\`\`\`ts
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; }
  }
  throw last;
}
\`\`\``;

const LATE_IMAGE_SRC = "/autoscroll-late-image.jpg";

// ── drive both widgets in lockstep ───────────────────────────────────────────

function injectUserBoth(content: string) {
  const id = nextId("u");
  for (const c of both) c.injectUserMessage({ id, content });
  return id;
}

function injectAssistantBoth(id: string, content: string, streaming: boolean) {
  for (const c of both) c.injectAssistantMessage({ id, content, streaming });
}

async function streamBoth(
  token: { cancelled: boolean },
  id: string,
  text: string,
  delay = 16,
) {
  const words = text.split(/(\s+)/);
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    if (token.cancelled) return;
    acc += words[i];
    injectAssistantBoth(id, acc, true);
    if (words[i].trim()) await sleep(delay);
  }
  if (!token.cancelled) injectAssistantBoth(id, acc, false);
}

function setBusy(busy: boolean) {
  document
    .querySelectorAll<HTMLButtonElement>(".sf-section .btn")
    .forEach((b) => {
      if (b.id !== "sf-cancel" && b.id !== "sf-reset") b.disabled = busy;
    });
}

async function run(label: string, fn: (t: { cancelled: boolean }) => Promise<void>) {
  const token = freshCancel();
  setBusy(true);
  log(`▶ ${label}`, "info");
  try {
    await fn(token);
  } finally {
    if (!token.cancelled) log(`✓ ${label}`);
    setBusy(false);
  }
}

// ── scenario buttons ─────────────────────────────────────────────────────────

document.getElementById("sf-seed")!.addEventListener("click", () =>
  run("Seed thread", async (token) => {
    for (const [q, a] of SEED_TURNS) {
      if (token.cancelled) return;
      injectUserBoth(q);
      await sleep(120);
      injectAssistantBoth(nextId("a"), a, false);
      await sleep(220);
    }
  }),
);

document.getElementById("sf-long")!.addEventListener("click", () =>
  run("Long reply + embed", async (token) => {
    injectUserBoth("Explain your whole scroll philosophy.");
    await sleep(120);
    await streamBoth(token, nextId("a"), LONG_PART_1, 14);
    if (token.cancelled) return;
    for (const c of both) tweetEmbed.inject(c, { url: TWEET_URL });
    log("Tweet embed injected — skeleton uses persona-shimmer-skeleton (P2).", "info");
    await sleep(400);
    if (token.cancelled) return;
    await streamBoth(token, nextId("a"), LONG_PART_2, 14);
  }),
);

document.getElementById("sf-rapid")!.addEventListener("click", () =>
  run("Rapid messages", async (token) => {
    for (let i = 0; i < 10; i++) {
      if (token.cancelled) return;
      if (i % 2 === 0) injectUserBoth(`Rapid message ${i + 1}`);
      else injectAssistantBoth(nextId("a"), `Reply ${i + 1}`, false);
      await sleep(160);
    }
  }),
);

document.getElementById("sf-image")!.addEventListener("click", () =>
  run("Late image", async (token) => {
    injectUserBoth("Show me the diagram.");
    await sleep(120);
    const id = nextId("a");
    await streamBoth(token, id, "Here's the diagram — it loads a beat after the text:", 16);
    if (token.cancelled) return;
    injectAssistantBoth(
      id,
      `Here's the diagram — it loads a beat after the text:\n\n![diagram](${LATE_IMAGE_SRC})`,
      false,
    );
  }),
);

document.getElementById("sf-mixed")?.addEventListener("click", () =>
  run("Mixed content", async (token) => {
    injectUserBoth("Show me tiers and the retry helper.");
    await sleep(120);
    await streamBoth(token, nextId("a"), MIXED, 8);
  }),
);

// ── Jump Nav: scrollToMessage() on both panels ───────────────────────────────

function jump(which: "first" | "last") {
  const messages = after.getMessages();
  if (messages.length === 0) {
    log("Seed or run a scenario first, then jump.", "warn");
    return;
  }
  const target = which === "first" ? messages[0] : messages[messages.length - 1];
  let ok = true;
  for (const c of both) ok = c.scrollToMessage(target.id, { block: "start" }) && ok;
  log(
    ok
      ? `scrollToMessage(${which}) — both panels jumped to ${target.id} (follow paused).`
      : `scrollToMessage(${which}) — message not rendered.`,
    ok ? "info" : "warn",
  );
}
document.getElementById("sf-jump-first")!.addEventListener("click", () => jump("first"));
document.getElementById("sf-jump-bottom")!.addEventListener("click", () => jump("last"));

// ── focus toggles (After panel only) ─────────────────────────────────────────

function bindFocus(id: string, key: keyof typeof focus, label: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  input.addEventListener("change", () => {
    focus[key] = input.checked;
    after.update(buildConfig(true));
    log(`${label} → ${input.checked ? "on" : "off"} (After panel)`, "info");
  });
}
bindFocus("sf-edge", "edge", "edgeFade");
bindFocus("sf-entrance", "entrance", "messageEntrance");
bindFocus("sf-visible", "visible", "visibilityTracking");

// ── utilities ─────────────────────────────────────────────────────────────────

document.getElementById("sf-cancel")!.addEventListener("click", () => {
  freshCancel();
  setBusy(false);
  log("Cancelled.", "warn");
});

document.getElementById("sf-reset")!.addEventListener("click", () => {
  freshCancel();
  for (const c of both) c.clearChat();
  counter = 0;
  seenIds.clear();
  seenEl.innerHTML = "seen: <b>0</b>";
  logEl.innerHTML = "";
  log("Reset both panels.", "warn");
});

log("Ready. Run a scenario, then scroll each panel to compare.", "info");
