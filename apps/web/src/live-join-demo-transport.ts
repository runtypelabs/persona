export const LIVE_JOIN_DEMO_ORIGIN = "https://persona-live-join.invalid";

type Delivery = {
  executionId: string;
  deliveryId: string;
  turnId: string;
  content: string;
  status: "pending" | "applied" | "settled" | "not_applied";
};
type Host = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  deliveries: Delivery[];
  timer?: ReturnType<typeof setTimeout>;
  seq: number;
  closed: boolean;
  toolCompleted: boolean;
};

/** In-memory teaching transport, not a durable backend or a security implementation. */
export function createLiveJoinDemoTransport(
  options: {
    delayMs?: number;
    onEvent?: (message: string) => void;
  } = {},
) {
  const deliveries = new Map<string, Delivery>();
  const hosts = new Set<Host>();
  let active: Host | undefined;
  let loseAck = false;
  let disposed = false;
  let executionCount = 0;
  const log = (message: string) => options.onEvent?.(message);
  const emit = (host: Host, frame: Record<string, unknown>) => {
    if (host.closed) return;
    host.controller.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ ...frame, executionId: host.id, seq: host.seq++ })}\n\n`,
      ),
    );
  };
  const finish = (host: Host, cancelled: boolean) => {
    if (host.closed) return;
    clearTimeout(host.timer);
    if (cancelled && !host.toolCompleted) {
      emit(host, {
        type: "tool_complete",
        toolCallId: `tool-${host.id}`,
        toolName: "check_availability",
        success: false,
        result: "Cancelled by visitor",
      });
      host.toolCompleted = true;
    }
    for (const delivery of host.deliveries) {
      delivery.status =
        cancelled && delivery.status === "pending" ? "not_applied" : "settled";
    }
    emit(host, {
      type: "execution_complete",
      kind: "agent",
      success: !cancelled,
      stopReason: cancelled ? "cancelled" : "end_turn",
    });
    host.closed = true;
    host.controller.close();
    hosts.delete(host);
    if (active === host) active = undefined;
    log(
      `${host.id}: ${cancelled ? "stopped; pending inputs not applied" : "complete; deliveries settled"}`,
    );
  };
  const respond = (host: Host) => {
    if (host.closed) return;
    const pending = host.deliveries.filter(
      (delivery) => delivery.status === "pending",
    );
    for (const delivery of pending) delivery.status = "applied";
    if (!host.toolCompleted)
      emit(host, {
        type: "tool_complete",
        toolCallId: `tool-${host.id}`,
        toolName: "check_availability",
        success: true,
        result: { checked: true },
        executionTime: options.delayMs ?? 8000,
      });
    host.toolCompleted = true;
    const text = `Demo response — not a live model.\n\nI kept working on “${host.deliveries[0]!.content}”${
      host.deliveries.length > 1
        ? ` and included ${host.deliveries.length - 1} follow-up(s): ${host.deliveries
            .slice(1)
            .map((delivery) => `“${delivery.content}”`)
            .join("; ")}`
        : ""
    }.\n\nOne execution. No restarted tool call.`;
    const id = `text-${host.id}-${host.seq}`;
    emit(host, { type: "text_start", id });
    let offset = 0;
    const chunk = () => {
      if (host.closed) return;
      emit(host, {
        type: "text_delta",
        id,
        delta: text.slice(offset, offset + 12),
      });
      offset += 12;
      if (offset < text.length) host.timer = setTimeout(chunk, 35);
      else {
        emit(host, { type: "text_complete", id });
        if (host.deliveries.some((delivery) => delivery.status === "pending")) {
          host.timer = setTimeout(() => respond(host), 400);
        } else {
          emit(host, {
            type: "turn_complete",
            id: `turn-${host.id}`,
            role: "assistant",
            stopReason: "end_turn",
          });
          finish(host, false);
        }
      }
    };
    chunk();
  };
  const receipt = (delivery: Delivery) =>
    Response.json(
      { accepted: true, ...delivery, deliveryStatus: delivery.status },
      { status: 202 },
    );
  const fetchDemo: typeof fetch = async (input, init) => {
    if (disposed) throw new Error("Demo transport disposed");
    const request = new Request(input, init);
    if (request.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const url = new URL(request.url);
    if (url.origin !== LIVE_JOIN_DEMO_ORIGIN)
      throw new Error("Not a demo request");
    if (url.pathname === "/v1/client/init") {
      return Response.json({
        sessionId: "cs_live_join_demo",
        conversationId: "record_live_join_demo",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        config: {},
        visitor: { token: "demo-visitor-not-a-credential" },
        durableRecovery: { enabled: true, join: true },
      });
    }
    if (url.pathname.endsWith("/cancel")) {
      const id = url.pathname.split("/").slice(-2)[0];
      const host = [...hosts].find((candidate) => candidate.id === id);
      if (host) finish(host, true);
      return Response.json(
        { executionId: id, accepted: Boolean(host) },
        { status: host ? 202 : 409 },
      );
    }
    if (url.pathname.includes("/deliveries/")) {
      const delivery = [...deliveries.values()].find(
        (candidate) =>
          candidate.deliveryId === url.pathname.split("/").slice(-1)[0],
      );
      return delivery
        ? Response.json(delivery)
        : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (url.pathname !== "/v1/client/chat")
      return Response.json(
        {
          error:
            "This demo only simulates admission, receipts, and Stop. Reload starts over.",
        },
        { status: 404 },
      );
    const body = await request.json();
    const message = body.messages?.[0];
    if (
      body.submitMode !== "join" ||
      body.messages?.length !== 1 ||
      message?.role !== "user" ||
      message.id !== body.turnId ||
      typeof message.content !== "string"
    ) {
      return Response.json({ error: "invalid_join_message" }, { status: 400 });
    }
    const previous = deliveries.get(body.turnId);
    if (previous) {
      if (previous.content !== message.content)
        return Response.json(
          { error: "idempotency_conflict" },
          { status: 409 },
        );
      log(`${previous.executionId}: duplicate retry → same receipt`);
      return receipt(previous);
    }
    if (deliveries.size >= 32)
      return Response.json(
        { error: "Demo full: reset to start again" },
        { status: 429 },
      );
    const joined = Boolean(active);
    let response: Response | undefined;
    if (!active) {
      const id = `demo-execution-${++executionCount}`;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          active = {
            id,
            controller,
            seq: 0,
            deliveries: [],
            closed: false,
            toolCompleted: false,
          };
          hosts.add(active);
        },
        cancel() {
          const host = [...hosts].find((candidate) => candidate.id === id);
          if (host) {
            host.closed = true;
            clearTimeout(host.timer);
            hosts.delete(host);
            if (active === host) active = undefined;
          }
        },
      });
      response = new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "X-Runtype-Execution-Id": id,
          "X-Runtype-Delivery-Id": `delivery-${body.turnId}`,
        },
      });
    }
    const host = active!;
    const delivery: Delivery = {
      executionId: host.id,
      deliveryId: `delivery-${body.turnId}`,
      turnId: body.turnId,
      content: message.content,
      status: joined ? "pending" : "applied",
    };
    deliveries.set(body.turnId, delivery);
    host.deliveries.push(delivery);
    if (joined) {
      log(`${host.id}: joined input ${host.deliveries.length} → 202 pending`);
      if (loseAck) {
        loseAck = false;
        log("Simulated lost acknowledgement; retry must reuse the receipt");
        throw new TypeError("Simulated lost acknowledgement");
      }
      return receipt(delivery);
    }
    log(
      `${host.id}: started → SSE; checking availability for ${(options.delayMs ?? 8000) / 1000}s`,
    );
    emit(host, {
      type: "execution_start",
      kind: "agent",
      agentId: "demo-agent",
      agentName: "Live join demo",
      maxTurns: 6,
      startedAt: new Date().toISOString(),
    });
    emit(host, {
      type: "turn_start",
      id: `turn-${host.id}`,
      role: "assistant",
      iteration: 1,
    });
    emit(host, {
      type: "tool_start",
      toolCallId: `tool-${host.id}`,
      toolName: "check_availability",
      toolType: "function",
      parameters: { request: message.content },
    });
    host.timer = setTimeout(() => respond(host), options.delayMs ?? 8000);
    return response!;
  };
  return {
    fetch: fetchDemo,
    loseNextAcknowledgement() {
      loseAck = true;
      log("Next joined acknowledgement will be dropped once");
    },
    dispose() {
      for (const host of hosts) finish(host, true);
      disposed = true;
    },
  };
}
