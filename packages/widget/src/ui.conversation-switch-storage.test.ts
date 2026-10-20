// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { AgentWidgetConfig, AgentWidgetStoredState } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
function setup(config: Partial<AgentWidgetConfig> = {}) {
  const provider = createDemoHistoryProvider({ conversations: [
    { id: "a", title: "A", messages: [{ id: "a-message", role: "assistant", content: "Conversation A" }] },
    { id: "b", title: "B", messages: [{ id: "b-message", role: "assistant", content: "Conversation B" }] },
  ] });
  const writes: AgentWidgetStoredState[] = [];
  const mount = document.createElement("div");
  document.body.append(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "/chat", launcher: { enabled: false }, welcome: { variant: "none" },
    features: { history: { enabled: true, provider } },
    storageAdapter: { load: () => null, save: state => { writes.push(structuredClone(state)); } },
    ...config,
  });
  controllers.push(controller);
  return { controller, provider, writes };
}
beforeEach(() => {
  window.scrollTo = vi.fn();
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => (element as HTMLElement).style);
});
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.destroy());
  document.body.replaceChildren(); document.head.replaceChildren(); localStorage.clear(); vi.restoreAllMocks();
});

describe("conversation switch storage boundaries", () => {
  it("never saves a source draft with the destination transcript", async () => {
    const { controller, writes } = setup();
    await controller.openConversation("a");
    controller.setMessage("Unsent A");
    // Switch before the draft debounce fires: capture must flush the source
    // and hydration must not persist it beside B's messages.
    await controller.openConversation("b");
    controller.setMessage("Unsent B");
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("Unsent A");
    expect(writes.some(state => state.messages?.[0]?.id === "a-message" && state.draft?.text === "Unsent A")).toBe(true);
    expect(writes.some(state => state.messages?.[0]?.id === "b-message" && state.draft?.text === "Unsent B")).toBe(true);
    for (const state of writes) {
      if (state.messages?.[0]?.id === "a-message") expect(state.draft?.text).not.toBe("Unsent B");
      if (state.messages?.[0]?.id === "b-message") expect(state.draft?.text).not.toBe("Unsent A");
    }
  });

  it("keeps a failed switch's draft available to the storage adapter on teardown", async () => {
    const { controller, provider, writes } = setup();
    await controller.openConversation("a");
    controller.setMessage("A survives a failed fetch");
    provider.failNext("getPage", { code: "unavailable" });
    await expect(controller.openConversation("b")).rejects.toMatchObject({ code: "unavailable" });
    expect(controller.getActiveConversationId()).toBe("a");
    expect(controller.getComposerState().text).toBe("A survives a failed fetch");
    controller.destroy(); controllers.splice(controllers.indexOf(controller), 1);
    expect(writes.at(-1)).toMatchObject({ messages: [{ id: "a-message" }], draft: { text: "A survives a failed fetch" } });
  });

  it("clearing one conversation does not discard another conversation's draft", async () => {
    const { controller } = setup();
    await controller.openConversation("a"); controller.setMessage("Keep A");
    await controller.openConversation("b"); controller.setMessage("Clear B");
    controller.clearChat();
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("Keep A");
    await controller.openConversation("b");
    expect(controller.getComposerState().text).toBe("");
  });

  it("deleting the active conversation retains another conversation's draft", async () => {
    const { controller } = setup();
    await controller.openConversation("a"); controller.setMessage("Keep A after deleting B");
    await controller.openConversation("b"); controller.setMessage("Discard B");
    await controller.deleteConversation("b");
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("Keep A after deleting B");
  });

  it("honors disabled draft persistence while retaining drafts in memory", async () => {
    const { controller, writes } = setup({ persistState: { persist: { draft: false } } });
    await controller.openConversation("a"); controller.setMessage("Memory only A");
    await controller.openConversation("b"); controller.setMessage("Memory only B");
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("Memory only A");
    controller.destroy(); controllers.splice(controllers.indexOf(controller), 1);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(state => state.draft === undefined)).toBe(true);
  });
});
