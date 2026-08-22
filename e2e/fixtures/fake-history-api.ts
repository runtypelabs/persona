import type { BrowserContext, Route } from "@playwright/test";

/**
 * Deterministic stand-in for the Runtype `/v1/client/*` visitor plane.
 *
 * Mirrors the wire shapes pinned by
 * `packages/widget/src/client-visitor-history.test.ts` and
 * `client-history-rest.test.ts`, so the browser suite exercises the real client
 * code paths (visitor store, Web Locks, storage events, continuity guard)
 * without a network.
 *
 * The fixture page mounts a clientToken widget with `apiUrl=/e2e-api`, so every
 * request is same-origin and reaches this handler.
 */

export interface RecordedRequest {
  method: string;
  /** Path after `/e2e-api/v1/client/`, e.g. `init`, `conversations/conv_1`. */
  path: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

export interface FakeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string | unknown[];
  displayContent?: string;
  displayAvailable: boolean;
  timestamp?: string;
}

export interface FakeConversation {
  id: string;
  title: string;
  targetId: string | null;
  preview: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  revision: string;
  messages: FakeMessage[];
}

export type GateName =
  | "init"
  | "chat"
  | "list"
  | "detail"
  | "projections"
  | "delete"
  | "reset";

interface Gate {
  promise: Promise<void>;
  release: () => void;
}

export interface FakeHistoryApi {
  /** Every intercepted request, in arrival order. */
  readonly requests: RecordedRequest[];
  /** Init responses that carried `visitor.token` (i.e. a server-side mint). */
  readonly mints: string[];
  readonly conversations: FakeConversation[];
  requestsTo(path: string): RecordedRequest[];
  /** Holds every response for `name` until the returned function is called. */
  hold(name: GateName): () => void;
  /** Replace the SSE body served by `/v1/client/chat`. */
  setChatStream(body: string): void;
  /** Force the next N responses for `name` to a status/body. */
  failNext(name: GateName, status: number, body?: unknown): void;
  /** Server-side revision bump, as another device appending would produce. */
  setRevision(conversationId: string, revision: string): void;
  /** Replace the stored transcript, e.g. to add a turn another device wrote. */
  setMessages(conversationId: string, messages: FakeMessage[]): void;
  /** Fill in the model channel the SSE turn produced but the wire never sent. */
  setModelContent(conversationId: string, messageId: string, content: string): void;
  addConversation(conversation: FakeConversation): void;
  reset(): void;
}

const ISO_FUTURE = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

export const sseEvent = (type: string, data: Record<string, unknown>): string =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

/** Minimal assistant turn: streams `text` and completes. */
export function textTurnStream(text: string, executionId = "exec_1"): string {
  const now = new Date().toISOString();
  return (
    sseEvent("execution_start", {
      kind: "agent",
      executionId,
      agentId: "virtual",
      agentName: "E2E",
      maxTurns: 1,
      startedAt: now,
      seq: 1,
    }) +
    sseEvent("turn_start", {
      executionId,
      id: "turn_1",
      iteration: 1,
      role: "assistant",
      seq: 2,
    }) +
    sseEvent("text_start", { executionId, id: "text_1", role: "assistant", seq: 3 }) +
    sseEvent("text_delta", { executionId, id: "text_1", delta: text, seq: 4 }) +
    sseEvent("text_complete", { executionId, id: "text_1", seq: 5 }) +
    sseEvent("turn_complete", {
      executionId,
      id: "turn_1",
      iteration: 1,
      role: "assistant",
      completedAt: now,
      seq: 6,
    }) +
    sseEvent("execution_complete", {
      kind: "agent",
      executionId,
      success: true,
      completedAt: now,
      seq: 7,
    })
  );
}

/**
 * Assistant turn whose display projection diverges from the model channel:
 * `transcript_insert` sets `content` (what the visitor sees) and `rawContent`
 * (what the model produced) directly, which is what makes the widget finalize
 * the projection over PATCH .../display-projections.
 */
export function divergentTurnStream(options: {
  messageId: string;
  display: string;
  raw: string;
  executionId?: string;
}): string {
  const executionId = options.executionId ?? "exec_div";
  const now = new Date().toISOString();
  return (
    sseEvent("execution_start", {
      kind: "agent",
      executionId,
      agentId: "virtual",
      agentName: "E2E",
      maxTurns: 1,
      startedAt: now,
      seq: 1,
    }) +
    sseEvent("transcript_insert", {
      message: {
        id: options.messageId,
        role: "assistant",
        content: options.display,
        rawContent: options.raw,
        createdAt: now,
        streaming: false,
      },
    }) +
    sseEvent("execution_complete", {
      kind: "agent",
      executionId,
      success: true,
      completedAt: now,
      seq: 2,
    })
  );
}

export interface FakeHistoryApiOptions {
  /** Route prefix; must match the fixture page's `apiUrl`. */
  basePath?: string;
  conversations?: FakeConversation[];
  /** Page size for the transcript detail route. Server clamps at 25. */
  messagePageSize?: number;
}

export async function installFakeHistoryApi(
  context: BrowserContext,
  options: FakeHistoryApiOptions = {}
): Promise<FakeHistoryApi> {
  const basePath = options.basePath ?? "/e2e-api";
  const messagePageSize = options.messagePageSize ?? 25;

  const requests: RecordedRequest[] = [];
  const mints: string[] = [];
  let conversations: FakeConversation[] = options.conversations
    ? options.conversations.map((c) => ({ ...c, messages: [...c.messages] }))
    : [];

  /** Live visitor credentials. A reset revokes by deletion. */
  const visitors = new Map<string, { id: string; endUserId: string | null }>();
  const sessions = new Map<string, { conversationId: string; token: string | null }>();

  let counter = 0;
  const next = (prefix: string): string => `${prefix}_${++counter}`;

  const gates = new Map<GateName, Gate>();
  const failures = new Map<GateName, Array<{ status: number; body: unknown }>>();

  let chatStream = textTurnStream("Hello from the fake transport.");

  const openGate = (name: GateName): (() => void) => {
    let release = (): void => {};
    const promise = new Promise<void>((resolve) => {
      release = () => {
        gates.delete(name);
        resolve();
      };
    });
    gates.set(name, { promise, release });
    return release;
  };

  const awaitGate = async (name: GateName): Promise<void> => {
    const gate = gates.get(name);
    if (gate) await gate.promise;
  };

  const takeFailure = (name: GateName): { status: number; body: unknown } | null =>
    failures.get(name)?.shift() ?? null;

  const json = (
    route: Route,
    body: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<void> =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Expose-Headers": "X-History-Identity-Status",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

  /** Browser-scope acknowledgement; the client rejects a 2xx without it. */
  const browserScope = { "X-History-Identity-Status": "not_provided" };

  const summary = (conversation: FakeConversation): Record<string, unknown> => ({
    id: conversation.id,
    title: conversation.title,
    targetId: conversation.targetId,
    preview: conversation.preview,
    messageCount: conversation.messages.length || conversation.messageCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });

  const findConversation = (id: string): FakeConversation | undefined =>
    conversations.find((conversation) => conversation.id === id);

  await context.route(`**${basePath}/v1/client/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(`${basePath}/v1/client/`, "");
    let body: Record<string, unknown> | null = null;
    try {
      const raw = request.postData();
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    const record: RecordedRequest = {
      method: request.method(),
      path,
      url: request.url(),
      query: Object.fromEntries(url.searchParams.entries()),
      headers: await request.allHeaders(),
      body,
    };
    requests.push(record);

    // ---- init -------------------------------------------------------------
    if (path === "init") {
      await awaitGate("init");
      const failure = takeFailure("init");
      if (failure) {
        return route.fulfill({
          status: failure.status,
          contentType: "application/json",
          body: JSON.stringify(failure.body ?? {}),
        });
      }

      const presented =
        typeof body?.visitorToken === "string" ? (body.visitorToken as string) : null;
      const resumeId =
        typeof body?.conversationId === "string" ? (body.conversationId as string) : null;
      const storedSessionId =
        typeof body?.sessionId === "string" ? (body.sessionId as string) : null;

      const resolved = presented && visitors.has(presented) ? presented : null;
      // Contract: a missing or revoked credential mints a fresh visitor rather
      // than failing, and the mint is the only time `visitor.token` appears.
      let mintedToken: string | null = null;
      let token = resolved;
      if (!token) {
        token = next("cvt");
        visitors.set(token, { id: next("vis"), endUserId: null });
        mintedToken = token;
        mints.push(token);
      }

      let conversationId: string;
      if (resumeId) {
        if (!findConversation(resumeId)) {
          return route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "not_found" }),
          });
        }
        conversationId = resumeId;
      } else if (storedSessionId && sessions.has(storedSessionId)) {
        conversationId = sessions.get(storedSessionId)!.conversationId;
      } else {
        conversationId = next("conv");
        if (!findConversation(conversationId)) {
          const now = new Date().toISOString();
          conversations.unshift({
            id: conversationId,
            title: "New conversation",
            targetId: "flow_e2e",
            preview: null,
            messageCount: 0,
            createdAt: now,
            updatedAt: now,
            revision: "rev_1",
            messages: [],
          });
        }
      }

      const sessionId = next("sess");
      sessions.set(sessionId, { conversationId, token });
      const conversation = findConversation(conversationId);

      return json(route, {
        sessionId,
        expiresAt: ISO_FUTURE,
        flow: { id: "flow_e2e", name: "E2E", description: null },
        conversationId,
        targetId: "flow_e2e",
        conversationRevision: conversation?.revision ?? "rev_1",
        visitor: {
          id: visitors.get(token)!.id,
          ...(mintedToken ? { token: mintedToken } : {}),
          expiresAt: ISO_FUTURE,
          endUserId: null,
          identityStatus: "not_provided",
        },
        config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
      });
    }

    // ---- chat -------------------------------------------------------------
    if (path === "chat") {
      await awaitGate("chat");
      const failure = takeFailure("chat");
      if (failure) {
        return route.fulfill({
          status: failure.status,
          contentType: "application/json",
          body: JSON.stringify(failure.body ?? {}),
        });
      }
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: chatStream,
      });
    }

    // ---- visitor reset ----------------------------------------------------
    if (path === "visitor/reset") {
      await awaitGate("reset");
      const presented = record.headers["x-visitor-token"];
      if (presented) visitors.delete(presented);
      return json(route, { reset: true }, browserScope);
    }

    // ---- history routes ---------------------------------------------------
    if (path.startsWith("conversations")) {
      const rest = path.slice("conversations".length).replace(/^\//, "");

      if (rest.endsWith("/display-projections")) {
        await awaitGate("projections");
        const failure = takeFailure("projections");
        if (failure) {
          return route.fulfill({
            status: failure.status,
            contentType: "application/json",
            body: JSON.stringify(failure.body ?? {}),
          });
        }
        const id = decodeURIComponent(rest.replace("/display-projections", ""));
        const conversation = findConversation(id);
        if (!conversation) {
          return route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "not_found" }),
          });
        }
        const patches = (body?.messages ?? []) as Array<{
          id: string;
          displayContent: string;
        }>;
        for (const patch of patches) {
          const message = conversation.messages.find((m) => m.id === patch.id);
          if (message) {
            message.displayContent = patch.displayContent;
            message.displayAvailable = true;
          } else {
            conversation.messages.push({
              id: patch.id,
              role: "assistant",
              displayContent: patch.displayContent,
              displayAvailable: true,
            });
          }
        }
        conversation.revision = next("rev");
        return json(
          route,
          { conversationRevision: conversation.revision },
          browserScope
        );
      }

      if (request.method() === "DELETE") {
        await awaitGate("delete");
        if (!rest) {
          const deleted = conversations.length;
          conversations = [];
          return json(route, { deleted }, browserScope);
        }
        const id = decodeURIComponent(rest);
        const before = conversations.length;
        conversations = conversations.filter((conversation) => conversation.id !== id);
        if (conversations.length === before) {
          return route.fulfill({
            status: 404,
            contentType: "application/json",
            headers: browserScope,
            body: JSON.stringify({ error: "not_found" }),
          });
        }
        return json(route, { deleted: 1 }, browserScope);
      }

      if (!rest) {
        await awaitGate("list");
        const failure = takeFailure("list");
        if (failure) {
          return route.fulfill({
            status: failure.status,
            contentType: "application/json",
            headers: browserScope,
            body: JSON.stringify(failure.body ?? {}),
          });
        }
        const listed = conversations.filter(
          (conversation) => conversation.messages.length > 0
        );
        return json(
          route,
          { data: listed.map(summary), nextCursor: null },
          browserScope
        );
      }

      await awaitGate("detail");
      const failure = takeFailure("detail");
      if (failure) {
        return route.fulfill({
          status: failure.status,
          contentType: "application/json",
          headers: browserScope,
          body: JSON.stringify(failure.body ?? {}),
        });
      }
      const id = decodeURIComponent(rest);
      const conversation = findConversation(id);
      if (!conversation) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          headers: browserScope,
          body: JSON.stringify({ error: "not_found" }),
        });
      }
      // Newest page first, oldest-first inside the page.
      const cursor = url.searchParams.get("messageCursor");
      const end = cursor
        ? Math.max(0, conversation.messages.findIndex((m) => m.id === cursor))
        : conversation.messages.length;
      const start = Math.max(0, end - messagePageSize);
      const page = conversation.messages.slice(start, end);
      return json(
        route,
        {
          ...summary(conversation),
          messages: page,
          nextMessageCursor: start > 0 ? conversation.messages[start]!.id : null,
          conversationRevision: conversation.revision,
        },
        browserScope
      );
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not_found" }),
    });
  });

  return {
    requests,
    mints,
    get conversations() {
      return conversations;
    },
    requestsTo(path: string) {
      return requests.filter((request) => request.path === path);
    },
    hold: openGate,
    setChatStream(next) {
      chatStream = next;
    },
    failNext(name, status, body) {
      const queue = failures.get(name) ?? [];
      queue.push({ status, body });
      failures.set(name, queue);
    },
    setRevision(conversationId, revision) {
      const conversation = findConversation(conversationId);
      if (conversation) conversation.revision = revision;
    },
    setMessages(conversationId, messages) {
      const conversation = findConversation(conversationId);
      if (!conversation) return;
      conversation.messages = [...messages];
      conversation.messageCount = messages.length;
      conversation.revision = next("rev");
    },
    setModelContent(conversationId, messageId, content) {
      const message = findConversation(conversationId)?.messages.find(
        (candidate) => candidate.id === messageId
      );
      if (message) message.content = content;
    },
    addConversation(conversation) {
      conversations.unshift({ ...conversation, messages: [...conversation.messages] });
    },
    reset() {
      requests.length = 0;
      mints.length = 0;
    },
  };
}
