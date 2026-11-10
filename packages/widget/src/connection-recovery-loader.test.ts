import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { createReconnectController } from "./session-reconnect";
import { loadSessionReconnect } from "./session-reconnect-loader";
import type { SessionReconnectModule } from "./session-reconnect-loader";

vi.mock("./session-reconnect-loader", () => ({ loadSessionReconnect: vi.fn() }));
const sessions: AgentWidgetSession[] = [];
afterEach(() => { sessions.splice(0).forEach(session => session.destroy()); vi.resetAllMocks(); });
const terminal = () => new Response('id: 3\nevent: execution_complete\ndata: {"type":"execution_complete","kind":"agent","success":true}\n\n');
const setup = () => {
  const reconnect = vi.fn(async () => terminal());
  const error = vi.fn();
  const session = new AgentWidgetSession({ apiUrl: "/chat", reconnectStream: reconnect }, {
    onMessagesChanged: () => {}, onStreamingChanged: () => {}, onStatusChanged: () => {}, onError: error,
  });
  sessions.push(session);
  return { session, reconnect, error };
};

describe("recovery while the reconnect module loads", () => {
  it("starts only the newest generation after cancel and another run share a pending import", async () => {
    let resolve!: (module: SessionReconnectModule) => void;
    vi.mocked(loadSessionReconnect).mockReturnValue(new Promise(done => { resolve = done; }));
    const { session, reconnect } = setup();
    session.resumeFromHandle({ executionId: "exec-old", after: "1" });
    session.cancel();
    session.resumeFromHandle({ executionId: "exec-new", after: "99" });
    resolve({ createReconnectController });
    await vi.waitFor(() => expect(session.getConnectionRecoveryState()).toBe("none"));
    expect(reconnect).toHaveBeenCalledOnce();
    expect(reconnect).toHaveBeenCalledWith(expect.objectContaining({ executionId: "exec-new", after: "99" }));
  });

  it("keeps recovery available when the module fails to load and retries the import manually", async () => {
    vi.mocked(loadSessionReconnect).mockRejectedValueOnce(new Error("Chunk unavailable"));
    const { session, reconnect, error } = setup();
    session.resumeFromHandle({ executionId: "exec-a", after: "5" });
    await vi.waitFor(() => expect(session.getConnectionRecoveryState()).toBe("interrupted"));
    expect(session.getResumableHandle()).toMatchObject({ executionId: "exec-a", lastEventId: "5" });
    expect(session.isStreaming()).toBe(false);
    expect(error).toHaveBeenCalledOnce();
    vi.mocked(loadSessionReconnect).mockResolvedValueOnce({ createReconnectController });
    session.reconnectNow();
    await vi.waitFor(() => expect(session.getConnectionRecoveryState()).toBe("none"));
    expect(loadSessionReconnect).toHaveBeenCalledTimes(2);
    expect(reconnect).toHaveBeenCalledWith(expect.objectContaining({ executionId: "exec-a", after: "5" }));
  });

  it("ignores an import failure after widget destruction", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(loadSessionReconnect).mockReturnValueOnce(new Promise((_resolve, done) => { reject = done; }));
    const { session, reconnect, error } = setup();
    session.resumeFromHandle({ executionId: "exec-a", after: "5" });
    session.destroy();
    reject(new Error("Late chunk error"));
    await new Promise(done => setTimeout(done, 5));
    expect(session.getConnectionRecoveryState()).toBe("none");
    expect(session.getResumableHandle()).toBeNull();
    expect(error).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
  });
});
