import type { AgentWidgetCustomFetch } from "@runtypelabs/persona";

type RunStatus = "running" | "completed" | "failed";
type Frame = { type: string; [key: string]: unknown };
type Run = {
  conversationId: string;
  executionId: string;
  textId: string;
  text: string;
  status: RunStatus;
  frames: Frame[];
  readers: Set<() => void>;
  observers: Set<(status: RunStatus) => void>;
  timer?: ReturnType<typeof setInterval>;
  tick?: () => void;
};

/** A browser-local stand-in for a durable server: aborting a reader never stops a job. */
export function createDemoDurableChat(options: {
  getConversationId: () => string | null;
  onComplete: (run: { conversationId: string; executionId: string; textId: string; text: string }) => void;
  delayMs?: number;
}) {
  const runs = new Map<string, Run>();
  const encoder = new TextEncoder();
  let serial = 0;
  let disposed = false;
  let paused = false;

  function lookup(conversationId: string, executionId: string) {
    const run = runs.get(executionId);
    if (!run || run.conversationId !== conversationId || disposed) throw new Error("Local execution not found");
    return run;
  }

  function attach(run: Run, after: string, signal?: AbortSignal | null): Response {
    let cursor = Number(after || 0);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > run.frames.length) throw new Error("Invalid local replay cursor");
    let release = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          release();
          controller.close();
        };
        const flush = () => {
          if (closed) return;
          while (cursor < run.frames.length) {
            const frame = run.frames[cursor++];
            controller.enqueue(encoder.encode(`id: ${cursor}\nevent: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`));
          }
          if (run.status !== "running" || disposed) close();
        };
        release = () => { run.readers.delete(flush); signal?.removeEventListener("abort", close); };
        run.readers.add(flush);
        if (signal?.aborted) close();
        else { signal?.addEventListener("abort", close, { once: true }); flush(); }
      },
      cancel() { release(); },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  }

  const customFetch: AgentWidgetCustomFetch = async (_url, init) => {
    const conversationId = options.getConversationId();
    if (!conversationId || disposed) throw new Error("Choose a local conversation before starting background work.");
    const executionId = `local-durable-${++serial}`;
    const textId = `${executionId}-text`;
    const text = "This local task kept working while you visited another conversation. " +
      "Returning catches up from the last event you saw, then follows the remaining reply. " +
      "Your draft and reading position belong to this conversation. No network or microphone is used in this demonstration.";
    const run: Run = { conversationId, executionId, textId, text, status: "running", frames: [], readers: new Set(), observers: new Set() };
    runs.set(executionId, run);
    const emit = (frame: Frame) => { run.frames.push(frame); run.readers.forEach(read => read()); };
    emit({ type: "execution_start", kind: "agent", executionId, agentId: "local-durable", agentName: "Local task", maxTurns: 1 });
    emit({ type: "turn_start", executionId, id: `${executionId}-turn`, role: "assistant", iteration: 1 });
    emit({ type: "text_start", executionId, id: textId });
    let position = 0;
    run.tick = () => {
      if (position < text.length) {
        emit({ type: "text_delta", executionId, id: textId, delta: text.slice(position, position + 8) });
        position += 8;
        return;
      }
      clearInterval(run.timer);
      emit({ type: "text_complete", executionId, id: textId });
      emit({ type: "turn_complete", executionId, id: `${executionId}-turn`, role: "assistant", stopReason: "end_turn" });
      // Persist the completed server projection even with no attached reader.
      options.onComplete(run);
      emit({ type: "execution_complete", kind: "agent", executionId, success: true, stopReason: "end_turn" });
      run.status = "completed";
      run.readers.forEach(read => read());
      run.observers.forEach(observe => observe(run.status));
    };
    if (!paused) run.timer = setInterval(run.tick, options.delayMs ?? 350);
    return attach(run, "0", init?.signal);
  };

  return {
    customFetch,
    // This server stand-in lives in the document too. Freeze its jobs while
    // cached, preserving frames/checkpoints for an explicit conversation reopen.
    pause() {
      paused = true;
      for (const run of runs.values()) clearInterval(run.timer);
    },
    resume() {
      if (!paused || disposed) return;
      paused = false;
      for (const run of runs.values()) {
        if (run.status === "running" && run.tick) run.timer = setInterval(run.tick, options.delayMs ?? 350);
      }
    },
    async reconnectStream(ctx: { conversationId: string; executionId: string; after: string; signal: AbortSignal }) {
      return attach(lookup(ctx.conversationId, ctx.executionId), ctx.after, ctx.signal);
    },
    subscribeStatus(ctx: { conversationId: string; executionId: string }, callback: (status: RunStatus) => void) {
      const run = lookup(ctx.conversationId, ctx.executionId);
      run.observers.add(callback);
      callback(run.status);
      return () => { run.observers.delete(callback); };
    },
    destroy() {
      disposed = true;
      for (const run of runs.values()) {
        clearInterval(run.timer);
        run.readers.forEach(read => read());
        run.observers.clear();
      }
      runs.clear();
    },
  };
}
