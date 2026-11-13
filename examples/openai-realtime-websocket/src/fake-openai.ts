import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * A local stand-in for the OpenAI Realtime WebSocket (text output only), so
 * the example and its test run with no key and no network. It checks the
 * browser auth subprotocols (`realtime` + `openai-insecure-api-key.<ek>`),
 * echoes `realtime`, and answers each `response.create` with
 * `You said: <text>` streamed as `response.output_text.delta` events.
 */
export const FAKE_PATH = "/fake-openai/v1/realtime";

export function createFakeOpenAIRealtime(options: { isValidSecret(secret: string): boolean; chunkDelayMs?: number }) {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has("realtime") ? "realtime" : false),
  });
  const delay = options.chunkDelayMs ?? 30;
  let ids = 0;
  const id = (prefix: string) => `${prefix}_${++ids}`;

  const serve = (ws: WebSocket) => {
    const send = (event: Record<string, unknown>) => ws.send(JSON.stringify({ event_id: id("event"), ...event }));
    let lastUserText = "";
    let cancelled = false;
    send({ type: "session.created", session: { type: "realtime", output_modalities: ["text"] } });
    ws.on("message", async (raw) => {
      let event: { type?: string; [key: string]: unknown };
      try {
        event = JSON.parse(String(raw));
      } catch {
        send({ type: "error", error: { type: "invalid_request_error", code: "invalid_json", message: "Not JSON" } });
        return;
      }
      switch (event.type) {
        case "session.update":
          send({ type: "session.updated", session: event.session });
          return;
        case "conversation.item.create": {
          const item = event.item as { content?: Array<{ type?: string; text?: string }> };
          lastUserText = (item.content ?? []).filter((c) => c.type === "input_text").map((c) => c.text ?? "").join("");
          send({ type: "conversation.item.created", item: { id: id("item"), ...item } });
          return;
        }
        case "response.create": {
          cancelled = false;
          const responseId = id("resp");
          const itemId = id("item");
          send({ type: "response.created", response: { id: responseId, status: "in_progress" } });
          const text = `You said: ${lastUserText}`;
          for (const delta of text.match(/.{1,4}/g) ?? []) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (cancelled || ws.readyState !== ws.OPEN) break;
            send({ type: "response.output_text.delta", response_id: responseId, item_id: itemId, output_index: 0, content_index: 0, delta });
          }
          if (ws.readyState !== ws.OPEN) return;
          if (!cancelled) {
            send({ type: "response.output_text.done", response_id: responseId, item_id: itemId, output_index: 0, content_index: 0, text });
          }
          send({ type: "response.done", response: { id: responseId, status: cancelled ? "cancelled" : "completed" } });
          return;
        }
        case "response.cancel":
          cancelled = true;
          return;
        default:
          return;
      }
    });
  };

  return {
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
      if (!req.url?.startsWith(FAKE_PATH)) return false;
      const offered = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
      const secret = offered.find((p) => p.startsWith("openai-insecure-api-key."))?.slice("openai-insecure-api-key.".length);
      if (!offered.includes("realtime") || !secret || !options.isValidSecret(secret)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return true;
      }
      wss.handleUpgrade(req, socket, head, serve);
      return true;
    },
    close: () => wss.close(),
  };
}
