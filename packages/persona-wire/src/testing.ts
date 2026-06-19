/**
 * Shared test helper, exported from `@persona-examples/wire/testing`.
 *
 * Parses a Persona SSE response and summarizes it so adapter tests can
 * assert the run is well-formed without re-implementing SSE parsing each time.
 */

export type ParsedFrame = { event: string; data: Record<string, any> };

/** Read a complete SSE `Response` body and parse it into `{ event, data }` frames. */
export async function collectSSE(res: Response): Promise<ParsedFrame[]> {
  const text = await res.text();
  const frames: ParsedFrame[] = [];
  for (const block of text.split("\n\n")) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event: "));
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (!eventLine || !dataLine) continue;
    frames.push({
      event: eventLine.slice("event: ".length),
      data: JSON.parse(dataLine.slice("data: ".length)),
    });
  }
  return frames;
}

export type WireSummary = {
  /** Ordered list of SSE event names. */
  events: string[];
  /** Assistant text reconstructed from `text_delta` frames. */
  text: string;
  /** Distinct `executionId`s seen; a valid run carries exactly one. */
  executionIds: Set<string>;
  /** Distinct `kind`s seen on lifecycle frames. */
  kinds: Set<string>;
  /** `true` when `execution_complete` reported success. */
  success: boolean;
  /** `true` when an `execution_error` frame was emitted. */
  errored: boolean;
  /** `true` when every frame's `seq` strictly increases. */
  seqMonotonic: boolean;
};

export function summarizeWire(frames: ParsedFrame[]): WireSummary {
  const events = frames.map((f) => f.event);
  const text = frames
    .filter((f) => f.event === "text_delta")
    .map((f) => String(f.data.delta ?? ""))
    .join("");
  const executionIds = new Set<string>(
    frames.map((f) => f.data.executionId).filter(Boolean) as string[],
  );
  const kinds = new Set<string>(frames.map((f) => f.data.kind).filter(Boolean) as string[]);
  const complete = frames.find((f) => f.event === "execution_complete");
  const seqs = frames.map((f) => f.data.seq as number);
  let seqMonotonic = true;
  for (let i = 1; i < seqs.length; i++) {
    if (!(seqs[i] > seqs[i - 1])) seqMonotonic = false;
  }
  return {
    events,
    text,
    executionIds,
    kinds,
    success: Boolean(complete?.data.success),
    errored: events.includes("execution_error"),
    seqMonotonic,
  };
}

/** Build a Persona proxy-mode dispatch `Request` carrying a single user message. */
export function dispatchRequest(content = "hi"): Request {
  return new Request("http://test.local/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content }] }),
  });
}
