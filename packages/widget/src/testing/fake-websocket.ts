/**
 * In-memory `WebSocket` double for transport tests. Each constructed socket is
 * recorded on `FakeWebSocket.instances`; tests drive the server side with
 * `open()`, `receive()`, and `serverClose()`.
 */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static reset(): void {
    FakeWebSocket.instances = [];
  }
  static last(): FakeWebSocket {
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!socket) throw new Error("No socket was opened");
    return socket;
  }

  readonly url: string;
  readonly protocols: string[];
  readyState = 0;
  binaryType = "blob";
  sent: unknown[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean?: boolean }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
    FakeWebSocket.instances.push(this);
  }

  /** Text frames the client sent, parsed as JSON where possible. */
  get sentJson(): Array<Record<string, unknown>> {
    return this.sent
      .filter((frame): frame is string => typeof frame === "string")
      .map((frame) => {
        try {
          return JSON.parse(frame) as Record<string, unknown>;
        } catch {
          return { raw: frame };
        }
      });
  }

  send(data: unknown): void {
    if (this.readyState !== 1) throw new Error("socket not open");
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= 2) return;
    this.closedWith = { code, reason };
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code: code ?? 1000, reason: reason ?? "", wasClean: true }));
  }

  // ---- server side ----
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(data: unknown): void {
    this.onmessage?.({ data: typeof data === "string" || data instanceof ArrayBuffer ? data : JSON.stringify(data) });
  }

  serverClose(code: number, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
}

/** Read a `Response` body to completion as text. */
export async function readAll(response: Response): Promise<string> {
  return response.text();
}

/** Read whatever is currently queued on a stream reader, without waiting for close. */
export async function readAvailable(reader: ReadableStreamDefaultReader<Uint8Array>, chunks: number): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for (let i = 0; i < chunks; i++) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}
