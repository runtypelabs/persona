import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { InputDeliveryError } from "./client";
import type { AgentWidgetMessage } from "./types";

const sessions: AgentWidgetSession[] = [];
function create() {
  let messages: AgentWidgetMessage[] = [];
  const errors: Error[] = [];
  const session = new AgentWidgetSession(
    { clientToken: "ct_test", composer: { streamingSubmitBehavior: "join" } },
    {
      onMessagesChanged: (next) => {
        messages = next;
      },
      onStatusChanged: () => {},
      onStreamingChanged: () => {},
      onError: (error) => errors.push(error),
    },
  );
  vi.spyOn(session.getClient(), "cancelClientExecution").mockResolvedValue();
  sessions.push(session);
  return { session, messages: () => messages, errors };
}
afterEach(() => {
  for (const session of sessions.splice(0)) session.clearMessages();
  vi.restoreAllMocks();
});

describe("session additive send", () => {
  it("serializes only admission and keeps the active controller and response intact", async () => {
    const fixture = create();
    const requests: Parameters<
      ReturnType<AgentWidgetSession["getClient"]>["dispatch"]
    >[0][] = [];
    let finish!: () => void;
    const dispatch = vi
      .spyOn(fixture.session.getClient(), "dispatch")
      .mockImplementation(async (options) => {
        requests.push(options);
        if (requests.length === 1)
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
      });
    const first = fixture.session.sendMessage("first");
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    const second = fixture.session.sendMessage("second");
    await Promise.resolve();
    expect(dispatch).toHaveBeenCalledTimes(1);
    requests[0].join!.onAdmission({
      kind: "stream",
      executionId: "exec_1",
      deliveryId: "del_1",
      status: "settled",
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    requests[1].join!.onAdmission({
      kind: "receipt",
      executionId: "exec_1",
      deliveryId: "del_2",
      status: "settled",
    });
    await second;
    expect(requests[0].signal?.aborted).toBe(false);
    expect(fixture.session.isStreaming()).toBe(true);
    expect(
      requests.map((request) =>
        request.messages.map((message) => message.content),
      ),
    ).toEqual([["first"], ["second"]]);
    expect(
      fixture.messages().filter((message) => message.role === "assistant"),
    ).toHaveLength(0);
    finish();
    await first;
  });

  it("a rejected input preserves the incumbent tool resolver and reconnect handle", async () => {
    const fixture = create();
    const internals = fixture.session as unknown as {
      abortController: AbortController;
      webMcpResolveControllers: Set<AbortController>;
      resumable: unknown;
      streaming: boolean;
    };
    const incumbent = new AbortController();
    const resolver = new AbortController();
    const handle = {
      executionId: "exec_1",
      lastEventId: "7",
      assistantMessageId: "asst_1",
      status: "running",
    };
    internals.abortController = incumbent;
    internals.webMcpResolveControllers.add(resolver);
    internals.resumable = handle;
    internals.streaming = true;
    vi.spyOn(fixture.session.getClient(), "dispatch").mockRejectedValue(
      new InputDeliveryError("full", true),
    );
    await fixture.session.sendMessage("new input");
    expect(incumbent.signal.aborted).toBe(false);
    expect(resolver.signal.aborted).toBe(false);
    expect(internals.resumable).toBe(handle);
    expect(fixture.session.isStreaming()).toBe(true);
    expect(fixture.messages()[0].delivery?.status).toBe("rejected");
  });

  it("explicit retry preserves the message and turn identity without truncating later messages", async () => {
    const fixture = create();
    const dispatch = vi
      .spyOn(fixture.session.getClient(), "dispatch")
      .mockRejectedValueOnce(new TypeError("lost acknowledgement"))
      .mockImplementationOnce(async (options) => {
        options.join!.onAdmission({
          kind: "receipt",
          executionId: "exec_1",
          deliveryId: "del_1",
          status: "settled",
        });
      });
    await fixture.session.sendMessage("uncertain");
    const id = fixture.messages()[0].id;
    fixture.session.injectAssistantMessage({ content: "incumbent response" });
    await fixture.session.retryJoinedMessage(id);
    expect(dispatch.mock.calls[0][0].join?.turnId).toBe(
      dispatch.mock.calls[1][0].join?.turnId,
    );
    expect(fixture.messages().map((message) => message.content)).toEqual([
      "uncertain",
      "incumbent response",
    ]);
    expect(fixture.messages()[0].delivery?.status).toBe("settled");
  });
  it("editing a joined message appends a new delivery without cancelling or truncating", async () => {
    const fixture = create();
    const dispatch = vi
      .spyOn(fixture.session.getClient(), "dispatch")
      .mockImplementation(async (options) => {
        options.join!.onAdmission({
          kind: "stream",
          executionId: "exec_1",
          deliveryId: "del_1",
          status: "settled",
        });
      });
    await fixture.session.sendMessage("original");
    const id = fixture.messages()[0].id;
    fixture.session.injectAssistantMessage({ content: "keep this response" });
    const originalSignal = dispatch.mock.calls[0][0].signal;
    fixture.session.resubmitFrom(id, {
      reason: "edit",
      replacement: { text: "edited addition", mentionRefs: [], options: {} },
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    expect(originalSignal?.aborted).toBe(false);
    expect(fixture.messages().map((message) => message.content)).toEqual([
      "original",
      "keep this response",
      "edited addition",
    ]);
    expect(dispatch.mock.calls[1][0].join?.turnId).not.toBe(id);
  });

  it("clearing the transcript ignores a late admission from its old conversation", async () => {
    const fixture = create();
    let admit!: () => void;
    vi.spyOn(fixture.session.getClient(), "dispatch").mockImplementation(
      async (options) => {
        await new Promise<void>((resolve) => {
          admit = () => {
            options.join!.onAdmission({
              kind: "stream",
              executionId: "old",
              deliveryId: "old",
              status: "settled",
            });
            resolve();
          };
        });
      },
    );
    const send = fixture.session.sendMessage("old conversation");
    await vi.waitFor(() => expect(admit).toBeTypeOf("function"));
    fixture.session.clearMessages();
    admit();
    await send;
    expect(fixture.messages()).toEqual([]);
    expect(fixture.session.isStreaming()).toBe(false);
  });
});

it("re-arms receipt polling for hydrated nonterminal deliveries", async () => {
  const fixture = create();
  const read = vi
    .spyOn(fixture.session.getClient(), "getInputDelivery")
    .mockResolvedValue({
      kind: "receipt",
      executionId: "exec_restored",
      deliveryId: "del_restored",
      status: "settled",
    });
  fixture.session.hydrateMessages([
    {
      id: "user_restored",
      role: "user",
      content: "restored",
      createdAt: new Date().toISOString(),
      delivery: {
        turnId: "user_restored",
        executionId: "exec_restored",
        deliveryId: "del_restored",
        status: "applied",
      },
    },
  ]);
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1), {
    timeout: 3000,
  });
  expect(fixture.messages()[0].delivery?.status).toBe("settled");
});

it("connection updates invalidate queued joins before replacing their client", async () => {
  const fixture = create();
  let admit!: () => void;
  const oldClient = fixture.session.getClient();
  const dispatch = vi
    .spyOn(oldClient, "dispatch")
    .mockImplementation(async (options) => {
      await new Promise<void>((resolve) => {
        admit = () => {
          options.join!.onAdmission({
            kind: "stream",
            executionId: "old",
            deliveryId: "old",
            status: "settled",
          });
          resolve();
        };
      });
    });
  const first = fixture.session.sendMessage("first old target");
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  const second = fixture.session.sendMessage("queued old target");
  fixture.session.updateConfig({ clientToken: "ct_other" });
  const newDispatch = vi
    .spyOn(fixture.session.getClient(), "dispatch")
    .mockResolvedValue();
  admit();
  await Promise.all([first, second]);
  expect(dispatch.mock.calls[0][0].signal?.aborted).toBe(true);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(newDispatch).not.toHaveBeenCalled();
  expect(fixture.session.canAcceptJoinedInput()).toBe(true);
});

it("Stop during a new acknowledgement cancels the newly admitted host, not a completed one", async () => {
  const fixture = create();
  const internal = fixture.session as unknown as {
    joinExecutionId: string | null;
  };
  internal.joinExecutionId = "completed-host";
  let admit!: () => void;
  const dispatch = vi
    .spyOn(fixture.session.getClient(), "dispatch")
    .mockImplementation(async (options) => {
      await new Promise<void>((resolve) => {
        admit = () => {
          options.join!.onAdmission({
            kind: "stream",
            executionId: "new-host",
            deliveryId: "new-delivery",
            status: "settled",
          });
          resolve();
        };
      });
    });
  const send = fixture.session.sendMessage("new host");
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  fixture.session.cancel();
  expect(
    fixture.session.getClient().cancelClientExecution,
  ).not.toHaveBeenCalled();
  expect(dispatch.mock.calls[0][0].signal?.aborted).toBe(false);
  admit();
  await send;
  expect(
    fixture.session.getClient().cancelClientExecution,
  ).toHaveBeenCalledExactlyOnceWith("new-host");
  expect(dispatch.mock.calls[0][0].signal?.aborted).toBe(true);
  expect(fixture.session.isStreaming()).toBe(false);
});
