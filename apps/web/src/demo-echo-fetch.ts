/**
 * In-browser echo `customFetch` for demos that have no live backend.
 *
 * Several showcase demos (text reveal effects, scroll engineering, tool-bubble
 * templates) are driven entirely by `controller.inject*()` and point `apiUrl`
 * at the dead sentinel `https://noop.test/chat`. The composer is still live, so
 * a visitor who types a message used to get a "couldn't reach the assistant"
 * fetch error. Wiring `customFetch: createDemoEchoFetch()` into those demos
 * makes a typed message stream back a friendly echo instead, with zero network
 * and zero cost.
 *
 * The echo emits Persona's unified SSE vocabulary (`execution_start` →
 * `turn_start` → `text_start` → `text_delta` → `text_complete` → `turn_complete`
 * → `execution_complete`), the same frames a real Runtype dispatch produces, so
 * it drives the exact streaming pipeline: typewriter / word-fade animations,
 * auto-scroll, and the typing indicator all behave as they would in production.
 * (The legacy `agent_turn_*` frames are no longer parsed by the 4.x client, so
 * the testing module's `buildAssistantTurnFrames` would render nothing here.)
 */

import {
  createMockSSEResponse,
  type MockSSEFrame,
} from "@runtypelabs/persona/testing";
import type {
  AgentWidgetCustomFetch,
  AgentWidgetRequestPayload,
} from "@runtypelabs/persona";

export interface DemoEchoFetchOptions {
  /** Characters per `text_delta` frame. Smaller streams more smoothly. Default 4. */
  chunkSize?: number;
  /** Delay between frames in ms. Default 28. */
  delayMs?: number;
  /**
   * Build the assistant reply from the visitor's latest message. Override to
   * tailor the echo (e.g. a longer body to exercise scrolling). The default
   * quotes the message back and explains that the demo is not connected to a
   * live model.
   */
  reply?: (userText: string) => string;
}

function partText(part: unknown): string {
  if (part && typeof part === "object") {
    const p = part as { type?: unknown; text?: unknown };
    if (p.type === "text" && typeof p.text === "string") return p.text;
  }
  return "";
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(partText).filter(Boolean).join(" ");
  return "";
}

function latestUserText(payload: AgentWidgetRequestPayload): string {
  const messages = payload?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return contentToText(messages[i].content).trim();
  }
  return "";
}

function defaultReply(userText: string): string {
  const quoted = userText ? `"${userText}"` : "your message";
  return [
    `You said ${quoted}.`,
    "",
    "This demo is not connected to a live model, so I am echoing you back to keep the streaming UI alive. Watch the text fill in token by token: that is the same pipeline a real agent drives, so the reveal animation, auto-scroll, and typing indicator all behave exactly as they would in production.",
  ].join("\n");
}

function echoFrames(executionId: string, text: string, chunkSize: number): MockSSEFrame[] {
  const turnId = "turn-1";
  const blockId = `${turnId}-text`;
  const deltas: MockSSEFrame[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    deltas.push({ type: "text_delta", executionId, id: blockId, delta: text.slice(i, i + chunkSize) });
  }
  return [
    {
      type: "execution_start",
      kind: "agent",
      executionId,
      agentId: "demo-echo",
      agentName: "Demo Echo",
      maxTurns: 1,
      startedAt: Date.now(),
    },
    { type: "turn_start", executionId, id: turnId, iteration: 1 },
    { type: "text_start", executionId, id: blockId },
    ...deltas,
    { type: "text_complete", executionId, id: blockId },
    { type: "turn_complete", executionId, id: turnId, stopReason: "complete" },
    { type: "execution_complete", kind: "agent", executionId, success: true, stopReason: "complete" },
  ];
}

/**
 * Returns a `customFetch` that streams a canned echo reply for every dispatch.
 * Drop it into a demo's config alongside (or instead of) the `noop.test`
 * `apiUrl`; `customFetch` is called in place of the network request, so the URL
 * is never hit.
 */
export function createDemoEchoFetch(
  options: DemoEchoFetchOptions = {},
): AgentWidgetCustomFetch {
  const chunkSize = Math.max(1, options.chunkSize ?? 4);
  const delayMs = options.delayMs ?? 28;
  const buildReply = options.reply ?? defaultReply;
  let turn = 0;

  // Named so the config inspector's "Code" tab renders a readable label
  // (`/* function */ demoEchoFetch()`) instead of "anonymous".
  return async function demoEchoFetch(_url, _init, payload) {
    turn += 1;
    const executionId = `demo-echo-${turn}`;
    const reply = buildReply(latestUserText(payload));
    return createMockSSEResponse(echoFrames(executionId, reply, chunkSize), { delayMs });
  };
}
