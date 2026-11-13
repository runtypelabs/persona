import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebSocketTransport } from "@runtypelabs/persona/websocket-transport";
import { createOpenAIRealtimeCodec } from "../public/openai-realtime-codec.js";
import { mintClientSecret } from "../src/mint";
import { startServer } from "../src/server";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const deltas = (sse: string) =>
  sse
    .split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string; success?: boolean });

describe("OpenAI Realtime over createWebSocketTransport", () => {
  it("streams a reply from the fake Realtime server with a minted secret", async () => {
    server = await startServer();
    const minted = (await (await fetch(`${server.url}/session`, { method: "POST" })).json()) as {
      value: string;
      url: string;
    };
    expect(minted.value).toMatch(/^ek_fake_/);
    const transport = createWebSocketTransport({
      url: minted.url,
      protocols: ["realtime", `openai-insecure-api-key.${minted.value}`],
      codec: createOpenAIRealtimeCodec(),
      awaitReady: true,
      lifecycle: null,
    });
    const response = await transport.request(
      {
        kind: "dispatch",
        url: "/unused",
        body: { messages: [{ role: "user", content: "hello" }] },
        init: { method: "POST" },
      },
      async () => {
        throw new Error("must not fall back to HTTP");
      }
    );
    const events = deltas(await response.text());
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["execution_start", "turn_start", "text_start", "text_delta", "text_complete", "execution_complete"])
    );
    expect(events.filter((e) => e.type === "text_delta").map((e) => e.delta).join("")).toBe("You said: hello");
    expect(events.at(-1)).toMatchObject({ type: "execution_complete", success: true });
    transport.destroy?.();
  });

  it("refuses a socket without a minted secret", async () => {
    server = await startServer();
    const transport = createWebSocketTransport({
      url: `${server.url.replace("http", "ws")}/fake-openai/v1/realtime`,
      protocols: ["realtime", "openai-insecure-api-key.ek_made_up"],
      codec: createOpenAIRealtimeCodec(),
      awaitReady: true,
      lifecycle: null,
      connectTimeoutMs: 2000,
    });
    await expect(transport.connect()).rejects.toMatchObject({ name: "PersonaTransportError" });
    transport.destroy?.();
  });

  it("maps a Realtime error event onto the open stream", () => {
    const codec = createOpenAIRealtimeCodec();
    codec.encode?.({ kind: "dispatch", url: "/", body: { messages: [] }, init: {} }, { streamId: "s1" });
    expect(codec.decode(JSON.stringify({ type: "error", error: { code: "rate_limit_exceeded", message: "Slow down" } }))).toEqual({
      kind: "error",
      streamId: "s1",
      code: "rate_limit_exceeded",
      message: "Slow down",
    });
  });

  it("keeps a cancelled response's late events off the next turn's stream", () => {
    const codec = createOpenAIRealtimeCodec();
    const send = (streamId: string) =>
      codec.encode?.({ kind: "dispatch", url: "/", body: { messages: [{ role: "user", content: "hi" }] }, init: {} }, { streamId });
    const decode = (event: Record<string, unknown>) => codec.decode(JSON.stringify(event));
    send("s1");
    decode({ type: "response.created", response: { id: "resp_1" } });
    codec.detach?.("s1");
    send("s2");
    expect(decode({ type: "response.output_text.delta", response_id: "resp_1", delta: "late" })).toBeNull();
    expect(decode({ type: "response.done", response: { id: "resp_1", status: "cancelled" } })).toBeNull();
    decode({ type: "response.created", response: { id: "resp_2" } });
    expect(decode({ type: "response.output_text.delta", response_id: "resp_2", delta: "new" })).toMatchObject({ streamId: "s2" });
  });

  it("ignores a response created for a turn stopped before the server acknowledged it", () => {
    const codec = createOpenAIRealtimeCodec();
    const send = (streamId: string) =>
      codec.encode?.({ kind: "dispatch", url: "/", body: { messages: [{ role: "user", content: "hi" }] }, init: {} }, { streamId });
    const decode = (event: Record<string, unknown>) => codec.decode(JSON.stringify(event));
    send("s1");
    codec.detach?.("s1");
    send("s2");
    expect(decode({ type: "response.created", response: { id: "resp_1" } })).toBeNull();
    expect(decode({ type: "response.done", response: { id: "resp_1", status: "cancelled" } })).toBeNull();
    expect(decode({ type: "response.created", response: { id: "resp_2" } })).toMatchObject({ streamId: "s2" });
  });

  it("streams the next reply after a reconnect that dropped a stopped turn's response.created", () => {
    const codec = createOpenAIRealtimeCodec();
    const send = (streamId: string) =>
      codec.encode?.({ kind: "dispatch", url: "/", body: { messages: [{ role: "user", content: "hi" }] }, init: {} }, { streamId });
    const decode = (event: Record<string, unknown>) => codec.decode(JSON.stringify(event));
    send("s1");
    codec.detach?.("s1");
    // The socket closes before `response.created` for s1 arrives; a fresh session starts.
    codec.open?.();
    send("s2");
    expect(decode({ type: "response.created", response: { id: "resp_2" } })).toMatchObject({ streamId: "s2" });
    expect(decode({ type: "response.output_text.delta", response_id: "resp_2", delta: "hi" })).toMatchObject({ streamId: "s2" });
  });

  it("mints with the documented client_secrets request and reads the secret", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ value: "ek_123", expires_at: 1_900_000_000, session: {} }));
    const session = await mintClientSecret({ apiKey: "sk-test", fetch: fetchSpy as unknown as typeof fetch });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-test");
    expect(JSON.parse(String(init.body))).toMatchObject({
      session: { type: "realtime", model: "gpt-realtime-2.1", output_modalities: ["text"] },
    });
    expect(session).toEqual({
      value: "ek_123",
      expiresAt: 1_900_000_000,
      url: "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1",
    });
  });
});
