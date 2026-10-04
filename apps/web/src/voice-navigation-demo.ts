import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  markdownPostprocessor,
  type AgentWidgetConfig,
  type VoiceProvider,
  type VoiceResult,
  type VoiceStatus,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { createDemoEchoFetch } from "./demo-echo-fetch";
import { createWebSpeechVoiceProvider } from "./custom-voice-provider";

/**
 * Voice across pages: a classic multi-page site (every link is a full document
 * load) with one floating assistant. Start a voice call, then navigate (click a
 * link, or ask the assistant to take you somewhere): the next page restores the
 * transcript and redials the call on its own.
 *
 * Nothing survives the unload itself: the WebSocket, mic stream and audio graph
 * all belong to the document. What makes it feel continuous:
 *
 *  - `persistState`: the transcript, open panel and "a call was live" record
 *    persist, and the widget redials at once on the next page.
 *  - Agent-driven navigation waits until the assistant has finished speaking,
 *    so the hand-off happens in a natural pause rather than mid-sentence.
 *  - Where the browser needs a fresh gesture before audio can start (Safari),
 *    the widget asks for a single mic tap instead.
 *
 * Two voice modes:
 *  - Runtype realtime (full duplex over WebSocket) when a client token and
 *    agent id are saved (here, or from the Voice Input & Output demo). The
 *    agent navigates through a `go_to_page` WebMCP page tool.
 *  - Keyless: a demo "call" over the browser's Web Speech API (Chrome) with
 *    browser TTS and an in-page echo backend that understands "take me to …".
 */

type PageId = "home" | "breads" | "visit";

const PAGES: Record<PageId, { label: string; title: string; lede: string; cards: [string, string][] }> = {
  home: {
    label: "Home",
    title: "Bread worth the walk.",
    lede: "A neighbourhood bakery. Start a voice call with the assistant, then move around the site: the call follows you.",
    cards: [
      ["Our breads", "Naturally leavened loaves, baked every morning."],
      ["Visit us", "Two shops, open from 7am."],
      ["Ask out loud", "Say “take me to the breads page”."],
    ],
  },
  breads: {
    label: "Breads",
    title: "Today’s loaves",
    lede: "Everything here is fermented for at least 24 hours.",
    cards: [
      ["Country sourdough", "Wheat, a little rye, a dark crust. $9"],
      ["Seeded rye", "Dense, sour, packed with sunflower and flax. $10"],
      ["Olive & thyme", "Kalamata olives and fresh thyme. $11"],
      ["Baguette", "Out of the oven at 7am and 3pm. $4"],
    ],
  },
  visit: {
    label: "Visit",
    title: "Come say hello",
    lede: "Two shops, same bread.",
    cards: [
      ["Market Street", "Mon to Sat, 7am to 5pm."],
      ["Harbour Lane", "Every day, 7am to 2pm."],
    ],
  },
};

const PAGE_IDS = Object.keys(PAGES) as PageId[];
const params = new URLSearchParams(window.location.search);
const currentPage: PageId = PAGE_IDS.includes(params.get("page") as PageId)
  ? (params.get("page") as PageId)
  : "home";
const pageUrl = (page: PageId) =>
  page === "home" ? "/voice-navigation-demo.html" : `/voice-navigation-demo.html?page=${page}`;

// --- Page shell ---------------------------------------------------------------

const nav = document.getElementById("site-nav")!;
for (const id of PAGE_IDS) {
  const link = document.createElement("a");
  link.href = pageUrl(id);
  link.textContent = PAGES[id].label;
  if (id === currentPage) link.setAttribute("aria-current", "page");
  nav.append(link);
}

const page = PAGES[currentPage];
const main = document.getElementById("page")!;
main.innerHTML = `
  <h1></h1>
  <p class="lede"></p>
  <div class="grid"></div>
`;
main.querySelector("h1")!.textContent = page.title;
main.querySelector(".lede")!.textContent = page.lede;
const grid = main.querySelector(".grid")!;
for (const [title, body] of page.cards) {
  const card = document.createElement("div");
  card.className = "card";
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  card.append(h, p);
  grid.append(card);
}

// --- Credentials (Runtype realtime mode) ------------------------------------------

const TOKEN_KEY = "voiceDemoClientToken";
const AGENT_KEY = "voiceDemoAgentId";
const readSaved = (key: string) => {
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
};
const clientToken = readSaved(TOKEN_KEY);
const agentId = readSaved(AGENT_KEY);
const realtime = Boolean(clientToken && agentId);
const voiceMode = realtime ? "realtime" : "keyless";

const note = document.createElement("div");
note.className = "note";
note.innerHTML = realtime
  ? `<strong>Runtype realtime voice.</strong> Open the assistant, tap the mic, then click a link or ask to go to another page.
     The call redials on the next page. <a href="#" id="forget-creds">Use keyless mode instead</a>.`
  : `<strong>Keyless mode</strong> (Chrome): a demo call over the browser's speech recognition, replies read aloud.
     Open the assistant, tap the mic and say “take me to the breads page”.
     For the realtime WebSocket call, add a Runtype client token and agent id:
     <form class="creds" id="creds"><input name="token" placeholder="Client token" autocomplete="off" />
     <input name="agent" placeholder="Agent id" autocomplete="off" /><button type="submit">Use realtime</button></form>`;
main.append(note);
note.querySelector<HTMLFormElement>("#creds")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget as HTMLFormElement);
  const token = String(data.get("token") ?? "").trim();
  const agent = String(data.get("agent") ?? "").trim();
  if (!token || !agent) return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(AGENT_KEY, agent);
  window.location.reload();
});
note.querySelector("#forget-creds")?.addEventListener("click", (event) => {
  event.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AGENT_KEY);
  window.location.reload();
});

// --- Navigate when the assistant has finished talking -------------------------------

let voiceStatus: VoiceStatus = "idle";
let streaming = false;

/**
 * Leave the page in a natural pause: no reply streaming, no voice audio playing,
 * no browser TTS speaking, held for a beat. Navigating mid-sentence would cut
 * the assistant off (the audio dies with the document).
 */
function navigateWhenSettled(target: PageId): void {
  const SETTLE_MS = 600;
  let quietSince = 0;
  const tick = () => {
    const busy =
      streaming ||
      voiceStatus === "speaking" ||
      voiceStatus === "processing" ||
      (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking);
    const now = performance.now();
    if (busy) quietSince = 0;
    else if (!quietSince) quietSince = now;
    if (quietSince && now - quietSince >= SETTLE_MS) {
      window.location.assign(pageUrl(target));
      return;
    }
    setTimeout(tick, 100);
  };
  // Give the reply a moment to start before judging "quiet".
  setTimeout(tick, 400);
}

const resolvePage = (text: string): PageId | null => {
  const t = text.toLowerCase();
  if (/\b(bread|breads|loaf|loaves|menu|sourdough)\b/.test(t)) return "breads";
  if (/\b(visit|hours|location|locations|address|shop|shops)\b/.test(t)) return "visit";
  if (/\b(home|start|front page|main page)\b/.test(t)) return "home";
  return null;
};

// --- Keyless mode: a demo "call" over Web Speech ------------------------------------

/**
 * Wraps the STT-only Web Speech adapter as a continuous call: one tap starts
 * it, recognition re-arms after each utterance (once browser TTS has finished,
 * so it doesn't hear itself), and the mic button hangs up. Reporting
 * `isBargeInActive()` is what makes the widget treat it as a live call, which
 * is also what it persists and redials after a navigation.
 */
function createWebSpeechCall(): VoiceProvider {
  const inner = createWebSpeechVoiceProvider({ language: "en-US", reportLevel: false });
  let live = false;
  let rearmTimer: ReturnType<typeof setTimeout> | undefined;
  const statusCallbacks: Array<(status: VoiceStatus) => void> = [];

  const rearm = () => {
    clearTimeout(rearmTimer);
    if (!live) return;
    const busy = streaming || (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking);
    if (busy) {
      rearmTimer = setTimeout(rearm, 250);
      return;
    }
    void inner.startListening();
  };

  // A failed start (mic denied, no speech service) ends the call: re-arming
  // would retry forever and keep reporting a dead call as live.
  const endCall = () => {
    live = false;
    clearTimeout(rearmTimer);
  };
  inner.onError(endCall);

  inner.onStatusChange((status) => {
    if (status === "error") endCall();
    statusCallbacks.forEach((cb) => cb(status));
    if (status === "idle" && live) rearmTimer = setTimeout(rearm, 400);
  });

  return {
    type: "custom",
    connect: () => inner.connect(),
    async disconnect() {
      live = false;
      clearTimeout(rearmTimer);
      await inner.disconnect();
    },
    async startListening() {
      live = true;
      try {
        await inner.startListening();
      } catch (error) {
        endCall();
        throw error;
      }
    },
    async stopListening() {
      live = false;
      clearTimeout(rearmTimer);
      await inner.stopListening();
    },
    onResult: (cb: (result: VoiceResult) => void) => inner.onResult(cb),
    onError: (cb) => inner.onError(cb),
    onStatusChange: (cb) => {
      statusCallbacks.push(cb);
    },
    getInterruptionMode: () => "barge-in",
    isBargeInActive: () => live,
    async deactivateBargeIn() {
      live = false;
      clearTimeout(rearmTimer);
      await inner.stopListening();
    },
  };
}

// Keyless replies: route "take me to …" to a navigation, echo the rest.
let pendingKeylessNav: PageId | null = null;
const keylessFetch = createDemoEchoFetch({
  reply: (userText) => {
    const target = resolvePage(userText);
    if (target && target !== currentPage) {
      pendingKeylessNav = target;
      return `Sure, taking you to the ${PAGES[target].label} page.`;
    }
    if (target === currentPage) return `You're already on the ${PAGES[target].label} page.`;
    return `You said: "${userText}". Try “take me to the breads page” or “where are you?”.`;
  },
});

// --- Runtype realtime mode: a WebMCP navigation tool ---------------------------------

if (realtime) {
  initializeWebMCPPolyfill();
  (document as unknown as { modelContext: { registerTool: (tool: unknown) => void } }).modelContext.registerTool({
    name: "go_to_page",
    title: "Go to page",
    description:
      "Navigate the visitor to another page of the Crumb & Co. bakery website. Pages: home, breads (today's loaves and prices), visit (shop locations and hours). Say a short sentence about where you're taking them; the page changes once you've finished speaking, and the call continues on the new page.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string", enum: PAGE_IDS } },
      required: ["page"],
    },
    annotations: { readOnlyHint: true },
    execute: async (args: { page: PageId }) => {
      const target = PAGE_IDS.includes(args.page) ? args.page : null;
      if (!target) return { content: [{ type: "text", text: `Unknown page "${args.page}".` }], isError: true };
      if (target !== currentPage) navigateWhenSettled(target);
      return {
        content: [{ type: "text", text: JSON.stringify({ navigating: target !== currentPage, page: target }) }],
      };
    },
  });
}

// --- Widget -------------------------------------------------------------------------

const runtypeHost = window.location.hostname === "localhost" ? "localhost:8787" : "api.runtype.com";

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  // The transcript, open panel and live-call record survive the navigation.
  // Its own keys, shared by the three pages and separate per mode: the default
  // `persona-state` is shared with every other demo on this origin, and a
  // keyless live-call record must not redial in realtime mode (or vice versa).
  persistState: { keyPrefix: `voice-nav-${voiceMode}-` },
  storageAdapter: createLocalStorageAdapter(`voice-nav-${voiceMode}-state`),
  ...(realtime
    ? {
        clientToken,
        agentId,
        apiUrl: window.location.hostname === "localhost" ? "http://localhost:8787" : "https://api.runtype.com",
        webmcp: { enabled: true },
        voiceRecognition: {
          enabled: true,
          provider: {
            type: "runtype",
            runtype: {
              agentId,
              host: runtypeHost,
              callContext: () => `The visitor is on the ${PAGES[currentPage].label} page of the Crumb & Co. bakery website.`,
            },
          },
        },
      }
    : {
        apiUrl: "https://noop.test/chat",
        customFetch: keylessFetch,
        voiceRecognition: {
          enabled: true,
          provider: { type: "custom", custom: () => createWebSpeechCall() },
        },
        textToSpeech: { enabled: true, provider: "browser" },
      }),
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: true,
    title: "Crumb & Co.",
    subtitle: realtime ? "Realtime voice" : "Keyless voice (Chrome)",
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Talk to the bakery",
    welcomeSubtitle: "Tap the mic, then move between pages: the call comes with you.",
    inputPlaceholder: "Tap the mic or type…",
  },
  suggestionChips: ["Take me to the breads page", "Where are your shops?"],
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
};

const controller = initAgentWidget({ target: "body", useShadowDom: false, config });

controller.on("voice:status", ({ status }) => {
  voiceStatus = status;
});
// A reply streams from the visitor's message until the assistant completes.
controller.on("user:message", () => {
  streaming = true;
});
controller.on("assistant:complete", () => {
  streaming = false;
  if (pendingKeylessNav) {
    const target = pendingKeylessNav;
    pendingKeylessNav = null;
    navigateWhenSettled(target);
  }
});

// --- Resume HUD: how long the call was down across the navigation --------------------

const NAV_STAMP_KEY = "voiceNavigationDemo:leftAt";
const hud = document.getElementById("resume-hud")!;
window.addEventListener("pagehide", () => {
  const live = voiceStatus !== "idle" && voiceStatus !== "disconnected" && voiceStatus !== "error";
  try {
    if (live) sessionStorage.setItem(NAV_STAMP_KEY, String(Date.now()));
    else sessionStorage.removeItem(NAV_STAMP_KEY);
  } catch {
    /* storage unavailable: no HUD */
  }
});
let leftAt = 0;
try {
  leftAt = Number(sessionStorage.getItem(NAV_STAMP_KEY) ?? 0);
  sessionStorage.removeItem(NAV_STAMP_KEY);
} catch {
  leftAt = 0;
}
if (leftAt) {
  hud.textContent = "Reconnecting voice…";
  const unsubscribe = controller.on("voice:status", ({ status }) => {
    if (status === "listening") {
      hud.textContent = `Voice back ${Date.now() - leftAt} ms after leaving the last page`;
      unsubscribe();
      setTimeout(() => (hud.textContent = ""), 6000);
    } else if (status === "error" || status === "disconnected") {
      hud.textContent = "Voice paused: tap the mic to resume";
      unsubscribe();
    }
  });
}
