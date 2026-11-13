import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type AgentWidgetMessage,
} from "@runtypelabs/persona";
import {
  REALTIME_DEMO_NOT_CONFIGURED,
  resolveRealtimeDemoTarget,
  type RealtimeDemoTarget,
} from "./realtime-demo-target";

/**
 * Socket vs SSE, side by side (`realtime-compare.html`). Two client-token
 * widgets on one page: the left asks for the client-session socket and connects
 * it at page load, the right stays on SSE and starts its session at page load, so
 * neither side's first turn pays for setup the other skipped. Each has its own `persistState.keyPrefix`, so its transcript,
 * session and visitor credential live under separate storage keys: each is a
 * separate visitor with its own conversation, and neither sees the other's turns.
 *
 * Measurements come from outside the widget. A `fetch` wrapper attributes each
 * request to a side by the user message id in the chat body (which the side's
 * `user:message` event reported) and then by `sessionId`; a chat answered `202`
 * was handed to the socket, a `200` streamed over SSE, and an events-route
 * reconnect during a socket turn marks it as having fallen back to SSE. A socket
 * side turn that did not ask for socket delivery was sent before the socket was
 * ready; that is labelled as such, not as a fallback.
 */

type Side = "socket" | "sse";
type Transport = "pending" | "socket" | "SSE" | "SSE, socket not open yet" | "socket, then SSE";
type Turn = {
  index: number;
  userMessageId: string;
  t0: number;
  transport: Transport;
  ackMs?: number;
  firstMs?: number;
  doneMs?: number;
};

// Build env first; `apiUrl`, `clientToken` and `agentId` query parameters override it.
const target = resolveRealtimeDemoTarget(new URLSearchParams(window.location.search), import.meta.env);
const SIDES: Side[] = ["socket", "sse"];
const HISTORY = 10;

const turns: Record<Side, Turn[]> = { socket: [], sse: [] };
const sideOfMessage = new Map<string, Side>();
const sideOfSession = new Map<string, Side>();
const sharedSendAt: Partial<Record<Side, number>> = {};
let socketState = "idle";
let socketCount = 0;

const sideElement = (side: Side) => document.querySelector(`.compare-side[data-side="${side}"]`) as HTMLElement;
const role = (side: Side, name: string) => sideElement(side).querySelector(`[data-role="${name}"]`) as HTMLElement;
const currentTurn = (side: Side) => turns[side][turns[side].length - 1];
const ms = (value: number | undefined) => (value === undefined ? "…" : `${Math.round(value)}`);

const median = (values: number[]) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

function render(side: Side) {
  const recent = turns[side].slice(-HISTORY);
  const firsts = recent.flatMap((t) => (t.firstMs === undefined ? [] : [t.firstMs]));
  const rows = [...recent].reverse().map((t) =>
    `<tr data-turn="${t.index}" data-transport="${t.transport}"><td>${t.index}</td><td>${t.transport}</td>` +
    `<td>${ms(t.ackMs)}</td><td>${ms(t.firstMs)}</td><td>${ms(t.doneMs)}</td></tr>`
  );
  role(side, "readout").innerHTML =
    `<div>median first content (last ${HISTORY}): <strong data-role="median">${ms(median(firsts))}</strong> ms</div>` +
    `<table><thead><tr><th>turn</th><th>transport</th><th>ack ms</th><th>first ms</th><th>done ms</th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table>`;
  const status = side === "socket"
    ? `socket ${socketState}${socketCount ? ` · ${socketCount} opened` : ""}`
    : "SSE (socket off)";
  role(side, "status").textContent = status;
  role(side, "status").dataset.state = side === "socket" ? socketState : "sse";
}

function setSocketState(state: string) {
  socketState = state;
  render("socket");
}

function markTransport(side: Side, transport: Transport) {
  const turn = currentTurn(side);
  if (!turn) return;
  turn.transport = transport;
  if (side === "socket" && (transport === "SSE" || transport === "socket, then SSE")) setSocketState("fallback (SSE)");
  render(side);
}

// Every socket on this page belongs to the left widget: the right one never opens one.
const NativeWebSocket = window.WebSocket;
window.WebSocket = class extends NativeWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    if (!String(url).includes("/ws/client/")) return;
    socketCount += 1;
    setSocketState("connecting");
    this.addEventListener("open", () => setSocketState("open"));
    this.addEventListener("close", (event) => {
      if (socketState !== "fallback (SSE)") setSocketState(`closed (${event.code})`);
    });
  }
} as typeof WebSocket;

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const parseBody = (init?: RequestInit): Record<string, unknown> | null => {
  if (typeof init?.body !== "string") return null;
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }
};

function chatSide(body: Record<string, unknown> | null): Side | undefined {
  const messages = Array.isArray(body?.messages) ? (body!.messages as Array<{ id?: string; role?: string }>) : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === "user" && message.id && sideOfMessage.has(message.id)) return sideOfMessage.get(message.id);
  }
  return typeof body?.sessionId === "string" ? sideOfSession.get(body.sessionId) : undefined;
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = requestUrl(input);
  const path = new URL(url, window.location.href).pathname;
  if (path.endsWith("/v1/client/chat")) {
    const body = parseBody(init);
    const side = chatSide(body);
    if (side && typeof body?.sessionId === "string") sideOfSession.set(body.sessionId, side);
    const response = await nativeFetch(input, init);
    const turn = side ? currentTurn(side) : undefined;
    if (side && turn && turn.ackMs === undefined) {
      turn.ackMs = performance.now() - turn.t0;
      const askedSocket = body?.delivery === "socket";
      markTransport(side, response.status === 202 ? "socket" : side === "socket" && !askedSocket ? "SSE, socket not open yet" : "SSE");
    }
    return response;
  }
  if (path.endsWith("/events")) {
    const sessionId = new URL(url, window.location.href).searchParams.get("sessionId") ?? "";
    const side = sideOfSession.get(sessionId);
    const turn = side ? currentTurn(side) : undefined;
    if (side && turn && turn.doneMs === undefined && turn.transport === "socket") markTransport(side, "socket, then SSE");
  }
  return nativeFetch(input, init);
};

function hasContentAfter(messages: AgentWidgetMessage[], userMessageId: string) {
  const at = messages.findIndex((m) => m.id === userMessageId);
  if (at < 0) return false;
  return messages.slice(at + 1).some((m) => m.role === "assistant" && typeof m.content === "string" && m.content.trim() !== "");
}

function config(side: Side, { apiUrl, clientToken, agentId }: RealtimeDemoTarget): AgentWidgetConfig {
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl,
    clientToken,
    ...(agentId ? { agentId } : {}),
    persistState: { keyPrefix: `realtime-compare-${side}-` },
    ...(side === "socket"
      ? { realtime: { connect: "load" } }
      : { realtime: false, sessionInit: ({ warm }) => warm() }),
    suggestionChips: [],
    launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%", fullHeight: true },
    welcome: { variant: "none" },
    copy: { ...DEFAULT_WIDGET_CONFIG.copy, inputPlaceholder: side === "socket" ? "Ask over the socket" : "Ask over SSE" },
  };
}

const form = document.getElementById("compare-send") as HTMLFormElement;
const input = document.getElementById("compare-input") as HTMLInputElement;
const sendButton = form.querySelector("button") as HTMLButtonElement;
const running: Record<Side, boolean> = { socket: false, sse: false };
// One prompt for both sides: sendable only while neither widget is mid-run.
const syncSharedSend = () => (sendButton.disabled = SIDES.some((side) => running[side]));

function start(target: RealtimeDemoTarget) {
  const controllers = {} as Record<Side, AgentWidgetController>;
  for (const side of SIDES) {
    const controller = initAgentWidget({ target: role(side, "host"), useShadowDom: false, config: config(side, target) });
    controllers[side] = controller;
    controller.on("user:message", (message) => {
      sideOfMessage.set(message.id, side);
      const shared = sharedSendAt[side];
      delete sharedSendAt[side];
      turns[side].push({
        index: turns[side].length + 1,
        userMessageId: message.id,
        t0: shared ?? performance.now(),
        transport: "pending",
      });
      render(side);
    });
    controller.on("messages:changed", (messages) => {
      const turn = currentTurn(side);
      if (!turn || turn.firstMs !== undefined || !hasContentAfter(messages, turn.userMessageId)) return;
      turn.firstMs = performance.now() - turn.t0;
      render(side);
    });
    controller.on("run:started", () => {
      running[side] = true;
      syncSharedSend();
    });
    // Once per run (an assistant message can complete mid-run); a turn with no content keeps first ms unset.
    controller.on("run:finished", () => {
      running[side] = false;
      syncSharedSend();
      const turn = currentTurn(side);
      if (!turn || turn.doneMs !== undefined) return;
      turn.doneMs = performance.now() - turn.t0;
      render(side);
    });
    render(side);
  }

  const statusLine = document.getElementById("compare-status") as HTMLElement;
  const idleStatus = `api ${target.apiUrl} · times in ms from the send click`;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || SIDES.some((side) => running[side])) return;
    const at = performance.now();
    const rejected = SIDES.filter((side) => {
      sharedSendAt[side] = at;
      if (controllers[side].submitMessage(text)) return false;
      delete sharedSendAt[side];
      return true;
    });
    // Keep the prompt when a side refused it, so it can be sent again.
    if (rejected.length) statusLine.textContent = `not sent to ${rejected.join(" and ")}: that widget is busy`;
    else {
      statusLine.textContent = idleStatus;
      input.value = "";
    }
  });

  statusLine.textContent = idleStatus;
  Object.assign(window as unknown as Record<string, unknown>, { __personaE2E: { controllers, turns } });
}

if (target) start(target);
else {
  (document.getElementById("compare-status") as HTMLElement).textContent = REALTIME_DEMO_NOT_CONFIGURED;
  sendButton.disabled = true;
  input.disabled = true;
}
