/** Shared helpers for mocking SSE streams in demos, previews, and tests. */

export interface MockSSEFrame {
  type: string;
  [key: string]: unknown;
}

export interface CreateMockSSEStreamOptions {
  /** Delay in ms between emitted frames. Default: 100. */
  delayMs?: number;
  /**
   * Named event name. When set, each frame is emitted as `event: <name>\ndata: ...\n\n`.
   * Omit for bare `data: ...\n\n` form (both are valid SSE and the widget parser accepts either).
   */
  eventName?: string;
}

const encoder = new TextEncoder();

export function createMockSSEStream(
  frames: ReadonlyArray<MockSSEFrame>,
  options?: CreateMockSSEStreamOptions
): ReadableStream<Uint8Array> {
  const delayMs = options?.delayMs ?? 100;
  const prefix = options?.eventName ? `event: ${options.eventName}\n` : "";
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= frames.length) {
        controller.close();
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      const payload = JSON.stringify(frames[index]);
      controller.enqueue(encoder.encode(`${prefix}data: ${payload}\n\n`));
      index += 1;
    },
  });
}

export interface AssistantTurnFramesOptions {
  /** Execution id shared across the turn's frames. */
  executionId: string;
  /** Turn id. Default: `turn-1`. */
  turnId?: string;
  /** Assistant text content to stream. */
  text: string;
  /** Approximate characters per `agent_turn_delta` frame. Default: 32. */
  chunkSize?: number;
}

/**
 * Builds the standard `agent_turn_start` → many `agent_turn_delta` → `agent_turn_complete`
 * frame sequence for simulating a streaming assistant reply. The frames drive the same
 * client pipeline as real SSE, so stream animations (typewriter, word-fade, etc.) engage.
 */
export function buildAssistantTurnFrames(options: AssistantTurnFramesOptions): MockSSEFrame[] {
  const { executionId, text } = options;
  const turnId = options.turnId ?? "turn-1";
  const chunkSize = Math.max(1, options.chunkSize ?? 32);

  const frames: MockSSEFrame[] = [{ type: "agent_turn_start", executionId, turnId }];
  for (let i = 0; i < text.length; i += chunkSize) {
    frames.push({
      type: "agent_turn_delta",
      executionId,
      turnId,
      delta: text.slice(i, i + chunkSize),
    });
  }
  frames.push({ type: "agent_turn_complete", executionId, turnId });
  return frames;
}

export interface MockSSEResponseOptions extends CreateMockSSEStreamOptions {
  status?: number;
  headers?: Record<string, string>;
}

/** Convenience wrapper: returns a `Response` ready to hand back from a `customFetch` implementation. */
export function createMockSSEResponse(
  frames: ReadonlyArray<MockSSEFrame>,
  options?: MockSSEResponseOptions
): Response {
  const stream = createMockSSEStream(frames, options);
  return new Response(stream, {
    status: options?.status ?? 200,
    headers: {
      "Content-Type": "text/event-stream",
      ...options?.headers,
    },
  });
}
