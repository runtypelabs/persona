/**
 * Mint a short-lived OpenAI Realtime client secret (`ek_...`) on the server so
 * the browser never sees the real API key. Docs:
 * https://developers.openai.com/api/docs/guides/voice-websockets?api=realtime
 * https://developers.openai.com/api/docs/api-reference/realtime-sessions
 */
export type RealtimeSession = {
  /** The ephemeral client secret the browser offers as a subprotocol. */
  value: string;
  /** Unix seconds; the browser re-mints shortly before this. */
  expiresAt: number | null;
  /** The socket URL the browser connects to. */
  url: string;
};

export const DEFAULT_MODEL = "gpt-realtime-2.1";

export async function mintClientSecret(options: {
  apiKey: string;
  model?: string;
  instructions?: string;
  ttlSeconds?: number;
  fetch?: typeof fetch;
}): Promise<RealtimeSession> {
  const model = options.model ?? DEFAULT_MODEL;
  const response = await (options.fetch ?? fetch)("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: options.ttlSeconds ?? 600 },
      session: {
        type: "realtime",
        model,
        output_modalities: ["text"],
        ...(options.instructions ? { instructions: options.instructions } : {}),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Minting a client secret failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as {
    value?: string;
    expires_at?: number;
    client_secret?: { value?: string; expires_at?: number };
  };
  const value = data.value ?? data.client_secret?.value;
  if (!value) throw new Error("The client secret response carried no value.");
  return {
    value,
    expiresAt: data.expires_at ?? data.client_secret?.expires_at ?? null,
    url: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
  };
}
