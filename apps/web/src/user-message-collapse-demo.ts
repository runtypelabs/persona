import "@runtypelabs/persona/widget.css";
import type {
  AgentWidgetConfig,
  AgentWidgetConfigPatch,
  AgentWidgetController,
  AgentWidgetMessage,
} from "@runtypelabs/persona";

import { createDemoConfigInspector, reportDemoConfig } from "./demo-config-inspector";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { renderDemoScaffold } from "./demo-scaffold";
import type { Mode } from "./examples-nav";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";

renderDemoScaffold({ slug: "user-message-collapse-demo" });

const configInspector = createDemoConfigInspector({ title: "Long Message Collapse" });

type Placement = "start" | "end" | "center";

const state = {
  enabled: true,
  maxHeight: 240,
  placement: "start" as Placement,
  fadeHeight: "",
  toggleForeground: "",
  showMoreLabel: "",
  showLessLabel: "",
};

// ── Sample messages ──────────────────────────────────────────────────

const SEEDED_PASTE = [
  "Can you help me turn these meeting notes into a short status update for the team? Pasting everything from the doc as-is.",
  "",
  "Attendees: Priya (eng), Marco (design), Lena (support), Sam (PM).",
  "",
  "1. Checkout redesign. Marco shared the new single-page flow. Address autocomplete is done, the order summary moves into a sticky sidebar on desktop and a collapsible drawer on mobile. Open question: do we keep the guest checkout link above the fold? Lena says roughly a third of support tickets come from people who could not find it.",
  "2. Payments migration. Priya is about 70% through moving card payments to the new provider. Refunds still go through the old integration until the reconciliation job is rewritten. Target is end of next sprint; risk is the webhook retry behavior, which differs between the two providers.",
  "3. Support load. Tickets are down 12% week over week after the shipping-times banner went live. The top three categories are still order status, address changes after purchase, and promo codes that do not stack.",
  "4. Analytics. We lost about two days of funnel data after the tag manager change. Sam will backfill from server logs where possible, but the mobile web numbers for that window are probably unrecoverable.",
  "5. Next steps. Marco to finalize the drawer interaction by Thursday. Priya to write up the webhook retry differences. Lena to draft help-center copy for address changes. Sam to share the backfilled funnel numbers on Monday.",
  "",
  "Please keep it under five bullet points and call out the payments risk explicitly.",
].join("\n");

const SAMPLES: Record<string, string> = {
  "stack-trace": [
    "Our checkout page started crashing after the last deploy. Here is the full trace from the browser console:",
    "",
    "```",
    "TypeError: Cannot read properties of undefined (reading 'currency')",
    "    at formatLineItem (checkout/summary.ts:48:31)",
    "    at Array.map (<anonymous>)",
    "    at renderSummary (checkout/summary.ts:112:24)",
    "    at CheckoutPage.update (checkout/page.ts:203:9)",
    "    at CartStore.notify (store/cart.ts:77:15)",
    "    at CartStore.applyPromo (store/cart.ts:164:10)",
    "    at async PromoForm.onSubmit (checkout/promo-form.ts:59:7)",
    "    at async HTMLFormElement.<anonymous> (checkout/promo-form.ts:22:5)",
    "Caused by: PromoResponseError: line item 3 missing price",
    "    at parsePromoResponse (api/promo.ts:91:13)",
    "    at applyPromoCode (api/promo.ts:40:18)",
    "    at async CartStore.applyPromo (store/cart.ts:158:22)",
    "    at async PromoForm.onSubmit (checkout/promo-form.ts:59:7)",
    "Request: POST /api/cart/promo { code: \"SPRING25\", cartId: \"c_81f3\" }",
    "Response: 200 { items: [ {...}, {...}, { sku: \"GIFT-WRAP\", price: null } ] }",
    "User agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/126.0",
    "Build: web@4.18.2 (commit 9c1e7a4)",
    "```",
    "",
    "It only happens when a promo code is applied to a cart with gift wrap. What should I check first?",
  ].join("\n"),
  transcript:
    "Okay so I'm walking to the train so I'll just talk this through. I've been going back and forth on whether we should move the newsletter to weekly or keep it every two weeks, and honestly I think the open rates are telling us something, because the issues that go out on Tuesdays do way better than the Friday ones, but I don't know if that's the day or the content, since the Tuesday ones have usually been the product update issues and the Friday ones are more like the roundup of links. And then there's the question of who actually writes it, because right now it's mostly me and I can't really do weekly on top of everything else, so if we go weekly we'd probably need Jordan to take every other issue, which I think they'd be up for, but we'd need some kind of template so it doesn't feel like two different newsletters. Oh, and I wanted to say, the sign-up form on the blog is still the old one, the one that doesn't ask for a role, so we can't really segment, and I think that matters more than the frequency honestly. And one more thing before I forget: the welcome email still links to the old pricing page, so anyone who signs up from the newsletter lands on prices that changed in March, which is probably why we keep getting those confused replies, and I'd rather fix that before we send more people there. Also the archive page doesn't have search, so when people ask for that one issue about onboarding checklists we end up digging through the sent folder to find it. Anyway, can you help me lay out the pros and cons and maybe a plan for a four-week trial, something we could look at with the team on Monday? Keep it practical, I don't need a big strategy doc.",
  spec: [
    "Here's the spec for the rate limiter. Can you review it for gaps before I start building?",
    "",
    "## Goals",
    "- Limit each API key to a configurable number of requests per minute.",
    "- Return `429` with a `Retry-After` header when the limit is exceeded.",
    "- Keep per-request overhead under 2ms at p99.",
    "",
    "## Design",
    "A sliding window counter in Redis, keyed by API key and the current minute. Each request increments the current bucket and reads the previous one, weighting it by how far into the minute we are.",
    "",
    "```ts",
    "async function allow(key: string, limit: number): Promise<boolean> {",
    "  const now = Date.now();",
    "  const minute = Math.floor(now / 60_000);",
    "  const elapsed = (now % 60_000) / 60_000;",
    "  const [current, previous] = await redis",
    "    .multi()",
    "    .incr(`rl:${key}:${minute}`)",
    "    .get(`rl:${key}:${minute - 1}`)",
    "    .expire(`rl:${key}:${minute}`, 120)",
    "    .exec();",
    "  const weighted = Number(previous ?? 0) * (1 - elapsed) + Number(current);",
    "  return weighted <= limit;",
    "}",
    "```",
    "",
    "## Open questions",
    "- Should rejected requests count toward the window?",
    "- How do we handle a Redis outage: fail open or fail closed?",
    "- Do burst allowances belong in v1?",
  ].join("\n"),
  short: "Thanks, that's really helpful!",
};

const INITIAL_MESSAGES: AgentWidgetMessage[] = [
  {
    id: "collapse-demo-user-1",
    role: "user",
    content: SEEDED_PASTE,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: "collapse-demo-assistant-1",
    role: "assistant",
    content:
      "Your pasted notes are collapsed to keep this reply in view. Use **Show more** to read them, or send one of the samples on the left.",
    createdAt: new Date(Date.now() - 55_000).toISOString(),
  },
];

const collapseFetch = createDemoEchoFetch({
  chunkSize: 6,
  delayMs: 22,
  reply: (userText) => {
    const lines = userText.split("\n").length;
    return lines > 1 || userText.length > 400
      ? `Got it: ${userText.length.toLocaleString()} characters over ${lines} line${lines === 1 ? "" : "s"}. Your message is collapsed above so this reply stays in view; **Show more** expands it in place. This is a scripted local reply, so no model read it.`
      : "Short messages never collapse. Send a long sample, or paste a long block of text into the composer.";
  },
});

// ── Config ───────────────────────────────────────────────────────────

// An empty label falls back to the built-in "Show more" / "Show less", and an
// explicit undefined resets a label or token on a live update.
const collapseFeature = () => ({ enabled: state.enabled, maxHeight: state.maxHeight });
const collapseCopy = () => ({
  showMoreLabel: state.showMoreLabel || undefined,
  showLessLabel: state.showLessLabel || undefined,
});
const collapseTokens = () => ({
  fadeHeight: state.fadeHeight || undefined,
  toggleForeground: state.toggleForeground || undefined,
});

const collapsePatch = (): AgentWidgetConfigPatch => ({
  features: { userMessageCollapse: collapseFeature() },
  copy: collapseCopy(),
  theme: { components: { userMessageCollapse: collapseTokens() } },
});

const buildConfig = (mode: Mode): AgentWidgetConfig => ({
  apiUrl: "/user-message-collapse-local-demo",
  customFetch: collapseFetch,
  future: { v5Defaults: true },
  persistState: false,
  initialMessages: INITIAL_MESSAGES,
  launcher: {
    enabled: mode === "launcher",
    width: mode === "launcher" ? "min(440px, 94vw)" : "100%",
    title: "Long messages",
  },
  welcome: {
    title: "Paste something long",
    subtitle: "Long user messages collapse behind a Show more button.",
  },
  features: {
    // anchor-top is the default: on send, the message scrolls near the top
    // and the reply streams in beneath it.
    scrollBehavior: { mode: "anchor-top" },
    userMessageCollapse: collapseFeature(),
  },
  copy: {
    inputPlaceholder: "Paste a long message…",
    ...collapseCopy(),
  },
  theme: { components: { userMessageCollapse: collapseTokens() } },
});

let activeMode: Mode = "inline";
let activeController: AgentWidgetController | null = null;

const applyLive = (): void => {
  activeController?.update(collapsePatch());
  reportDemoConfig(configInspector, { config: buildConfig(activeMode), mode: activeMode });
};

setupMountMode({
  slug: "user-message-collapse-demo",
  modes: ["inline", "launcher"],
  mount: (mode, { stage }) => {
    activeMode = mode;
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

// ── Placement (CSS only) ─────────────────────────────────────────────

// The documented rules, verbatim. The toggle is not configured through
// `controller.update()`: a page stylesheet moves it.
const PLACEMENT_CSS: Record<Placement, string> = {
  start: "",
  end: ".persona-user-collapse-toggle { display: flex; margin-inline-start: auto; }",
  center: ".persona-user-collapse-toggle { display: flex; margin-inline: auto; }",
};

const placementStyle = document.createElement("style");
placementStyle.dataset.collapsePlacement = "";
document.head.appendChild(placementStyle);

// ── Controls ─────────────────────────────────────────────────────────

const bindGroup = (
  selector: string,
  attribute: string,
  onSelect: (value: string) => void,
): void => {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset[attribute] ?? "";
      buttons.forEach((b) =>
        b.setAttribute("aria-pressed", b === button ? "true" : "false"),
      );
      onSelect(value);
    });
  });
};

bindGroup(".collapse-height-button", "height", (value) => {
  state.maxHeight = Number(value);
  applyLive();
});

bindGroup(".collapse-placement-button", "placement", (value) => {
  state.placement = value as Placement;
  placementStyle.textContent = PLACEMENT_CSS[state.placement];
});

bindGroup(".collapse-fade-button", "fade", (value) => {
  state.fadeHeight = value;
  applyLive();
});

bindGroup(".collapse-color-button", "color", (value) => {
  state.toggleForeground = value;
  applyLive();
});

const enabledToggle = document.getElementById("collapse-enabled") as HTMLInputElement | null;
enabledToggle?.addEventListener("change", () => {
  state.enabled = enabledToggle.checked;
  applyLive();
});

const moreInput = document.getElementById("collapse-more-label") as HTMLInputElement | null;
const lessInput = document.getElementById("collapse-less-label") as HTMLInputElement | null;

const setLabels = (more: string, less: string): void => {
  if (moreInput) moreInput.value = more;
  if (lessInput) lessInput.value = less;
  state.showMoreLabel = more.trim();
  state.showLessLabel = less.trim();
  applyLive();
};

const onLabelInput = (): void => setLabels(moreInput?.value ?? "", lessInput?.value ?? "");
moreInput?.addEventListener("input", onLabelInput);
lessInput?.addEventListener("input", onLabelInput);

document
  .getElementById("collapse-labels-de")
  ?.addEventListener("click", () => setLabels("Mehr anzeigen", "Weniger anzeigen"));
document
  .getElementById("collapse-labels-reset")
  ?.addEventListener("click", () => setLabels("", ""));

document.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    const text = SAMPLES[button.dataset.sample ?? ""];
    if (!text || !activeController) return;
    // The real send path: the message is appended, dispatched to the local
    // customFetch, and measured like anything typed into the composer.
    // Returns false (a no-op) while a reply is still streaming.
    activeController.submitMessage(text);
  });
});

// Keep the controller reachable from the browser console while exploring.
Object.defineProperty(window, "userMessageCollapseDemoController", {
  configurable: true,
  get: () => activeController,
});
