// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";

const widgets: ReturnType<typeof createAgentExperience>[] = [];
afterEach(() => {
  widgets.splice(0).forEach(widget => widget.destroy());
  document.body.replaceChildren(); document.head.replaceChildren(); localStorage.clear();
  vi.restoreAllMocks();
});

it.each([false, true])("restores the draft and emits conversation-scoped background state with V5=%s", async v5Defaults => {
  window.scrollTo = vi.fn();
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => (element as HTMLElement).style);
  const encoder = new TextEncoder();
  const frame = (id: number, data: Record<string, unknown>) => encoder.encode(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
  const live = new ReadableStream<Uint8Array>({ start(stream) {
    stream.enqueue(frame(1, { type: "text_delta", id: "text-a", executionId: "exec-a", delta: "Partial" }));
  } });
  const provider = createDemoHistoryProvider({ conversations: ["a", "b"].map(id => ({ id, title: id, messages: [] })) });
  const mount = document.createElement("div"); document.body.append(mount);
  const reconnect = vi.fn(async () => new Response(new ReadableStream({ start(stream) {
    stream.enqueue(frame(2, { type: "text_delta", id: "text-a", executionId: "exec-a", delta: " reply" }));
    stream.enqueue(frame(3, { type: "execution_complete", executionId: "exec-a", success: true, kind: "agent" }));
    stream.close();
  } })));
  const widget = createAgentExperience(mount, {
    apiUrl: "/local", persistState: false, future: { v5Defaults }, launcher: { enabled: false },
    welcome: { variant: "none" }, features: { history: { enabled: true, provider } },
    customFetch: async () => new Response(live),
    backgroundConversations: { capabilities: { durableExecution: true, readOnlyReplay: true }, reconnectStream: reconnect },
  });
  widgets.push(widget);
  const states = vi.fn(); widget.on("conversation:executionState", states);
  await widget.openConversation("a"); widget.submitMessage("Start a task");
  await vi.waitFor(() => expect(widget.getMessages().some(message => message.content === "Partial")).toBe(true));
  const input = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  input.value = "Follow-up draft A";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(widget.getComposerState().text).toBe("Follow-up draft A");
  await widget.openConversation("b", { busy: "background" });
  expect(widget.getComposerState().text).toBe("");
  expect(states).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "a", status: "running", detached: true }), expect.objectContaining({ instanceId: expect.any(String) }));
  widget.setMessage("Draft B");
  await widget.openConversation("a");
  await vi.waitFor(() => expect(widget.getMessages().filter(message => message.content === "Partial reply")).toHaveLength(1));
  expect(widget.getComposerState().text).toBe("Follow-up draft A");
  expect(reconnect).toHaveBeenCalledOnce();
  expect(states).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "a", status: "completed", detached: false }), expect.objectContaining({ instanceId: expect.any(String) }));
  await widget.openConversation("b");
  expect(widget.getComposerState().text).toBe("Draft B");
});
