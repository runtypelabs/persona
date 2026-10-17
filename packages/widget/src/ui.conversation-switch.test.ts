// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { AgentWidgetConfig, ContentPart } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const seeds = [
  { id: "a", title: "A", messages: [
    { id: "a0", role: "user" as const, content: "First A" },
    { id: "a1", role: "assistant" as const, content: "Second A" },
  ] },
  { id: "b", title: "B", messages: [{ id: "b0", role: "assistant" as const, content: "B" }] },
];
const setup = (config: Partial<AgentWidgetConfig> = {}) => {
  const provider = createDemoHistoryProvider({ conversations: seeds });
  const mount = document.createElement("div"); document.body.append(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "/chat", persistState: false, launcher: { enabled: false },
    welcome: { variant: "none" }, features: { history: { enabled: true, provider } },
    ...config,
  });
  controllers.push(controller);
  return { mount, controller, provider };
};
beforeEach(() => {
  window.scrollTo = vi.fn();
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => (element as HTMLElement).style);
});
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.destroy());
  document.body.replaceChildren(); document.head.replaceChildren(); localStorage.clear();
  vi.restoreAllMocks(); vi.useRealTimers();
});

describe("conversation composer and reader continuity", () => {
  it.each([false, true])("isolates model, modes and quote with v5Defaults=%s even without persistence", async (v5Defaults) => {
    const { mount, controller } = setup({ future: { v5Defaults }, composer: {
      models: [{ id: "fast", label: "Fast" }, { id: "smart", label: "Smart" }],
      selectedModelId: "fast", modes: [{ id: "research", label: "Research" }],
    } });
    await controller.openConversation("a");
    controller.setMessage("Draft A"); controller.setComposerModes(["research"]);
    controller.setQuote({ text: "Second A", messageId: "a1", sourceLabel: "A" });
    const picker = mount.querySelector("[data-persona-composer-model-picker]");
    if (picker instanceof HTMLSelectElement) { picker.value = "smart"; picker.dispatchEvent(new Event("change", { bubbles: true })); }
    else {
      (picker as HTMLButtonElement).click();
      document.querySelector<HTMLButtonElement>('[data-persona-model-option="smart"]')!.click();
    }
    expect(controller.getComposerState().selectedModelId).toBe("smart");
    const stateA = controller.getComposerState();
    await controller.openConversation("b");
    expect(controller.getComposerState()).toMatchObject({ text: "", selectedModelId: "fast", activeModeIds: [] });
    expect(controller.getComposerState().quote).toBeUndefined();
    controller.setMessage("Draft B");
    await controller.openConversation("a");
    expect(controller.getComposerState()).toMatchObject({ text: "Draft A", selectedModelId: stateA.selectedModelId, activeModeIds: ["research"], quote: { text: "Second A", messageId: "a1" } });
    await controller.openConversation("b"); expect(controller.getComposerState().text).toBe("Draft B");
  });

  it("drops cached drafts on identity replacement even with an empty active transcript and reused provider", async () => {
    const provider = createDemoHistoryProvider({ conversations: [seeds[0], { id: "b", title: "Empty B", messages: [] }] });
    const { controller } = setup({
      features: { history: { enabled: true, provider } },
      getIdentityProof: async () => "account-a",
    });
    await controller.openConversation("a"); controller.setMessage("Private A draft");
    await controller.openConversation("b");
    expect(controller.getMessages()).toHaveLength(0);
    controller.update({ getIdentityProof: async () => "account-b" });
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("");
  });

  it("prunes only the complete opaque conversation id", async () => {
    const provider = createDemoHistoryProvider({ conversations: [
      ...seeds, { id: "workspace:a", title: "Nested A", messages: [] },
    ] });
    const { controller } = setup({ features: { history: { enabled: true, provider } } });
    await controller.openConversation("workspace:a"); controller.setMessage("Keep opaque-id draft");
    await controller.openConversation("a");
    await controller.deleteConversation("a");
    await controller.openConversation("workspace:a");
    expect(controller.getComposerState().text).toBe("Keep opaque-id draft");
  });

  it("retains an upload with its origin while another conversation is active", async () => {
    let finish!: (part: ContentPart) => void;
    const { mount, controller } = setup({ attachments: { enabled: true, adapter: {
      add: () => new Promise(resolve => { finish = resolve; }),
    } } });
    await controller.openConversation("a");
    const input = mount.querySelector<HTMLInputElement>("[data-persona-composer-attachment-input]")!;
    const file = new File(["draft"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true })); await flush();
    expect(controller.getComposerState().attachments[0]?.status).toBe("uploading");
    const attachmentId = controller.getComposerState().attachments[0].id;
    await controller.openConversation("b");
    finish({ type: "text", text: "Uploaded notes" }); await flush();
    expect(controller.getComposerState().attachments).toHaveLength(0);
    expect(mount.querySelector("[data-attachment-id]")).toBeNull();
    await controller.openConversation("a");
    expect(controller.getComposerState().attachments).toMatchObject([{ id: attachmentId, status: "ready", name: "notes.txt" }]);
    expect(mount.querySelector(`[data-attachment-id="${attachmentId}"]`)).not.toBeNull();
  });

  it("applies current upload adapters and limits to retained conversation drafts", async () => {
    const oldAdd = vi.fn(async (): Promise<ContentPart> => ({ type: "text", text: "old" }));
    const newAdd = vi.fn(async (): Promise<ContentPart> => ({ type: "text", text: "new" }));
    const rejected = vi.fn();
    const { mount, controller } = setup({ attachments: {
      enabled: true, adapter: { add: oldAdd }, allowedTypes: ["text/plain"], maxFiles: 1, maxFileSize: 3,
    } });
    const pick = async (name: string, type: string, text: string) => {
      const picker = mount.querySelector<HTMLInputElement>("[data-persona-composer-attachment-input]")!;
      Object.defineProperty(picker, "files", { configurable: true, value: [new File([text], name, { type })] });
      picker.dispatchEvent(new Event("change", { bubbles: true })); await flush();
    };
    await controller.openConversation("a"); await pick("a.txt", "text/plain", "hi");
    await controller.openConversation("b");
    controller.update({ attachments: { adapter: { add: newAdd }, allowedTypes: ["application/json"], maxFiles: 3, maxFileSize: 10, onFileRejected: rejected } });
    await controller.openConversation("a");
    await pick("type.txt", "text/plain", "hi");
    expect(rejected).toHaveBeenLastCalledWith(expect.objectContaining({ name: "type.txt" }), "type");
    await pick("size.json", "application/json", "more than ten bytes");
    expect(rejected).toHaveBeenLastCalledWith(expect.objectContaining({ name: "size.json" }), "size");
    await pick("new.json", "application/json", "[123]");
    await pick("third.json", "application/json", "{}");
    expect(controller.getComposerState().attachments).toHaveLength(3);
    expect(oldAdd).toHaveBeenCalledTimes(1);
    expect(newAdd).toHaveBeenCalledTimes(2);
    await pick("fourth.json", "application/json", "{}");
    expect(rejected).toHaveBeenLastCalledWith(expect.objectContaining({ name: "fourth.json" }), "count");

    await controller.openConversation("b");
    controller.update({ attachments: { adapter: undefined, allowedTypes: undefined, maxFiles: undefined, maxFileSize: undefined, onFileRejected: undefined } });
    await controller.openConversation("a");
    await pick("default.txt", "text/plain", "larger than the previous limit");
    await vi.waitFor(() => expect(controller.getComposerState().attachments[3]?.status).toBe("ready"));
    expect(newAdd).toHaveBeenCalledTimes(2);
    await pick("fifth.txt", "text/plain", "hi");
    expect(controller.getComposerState().attachments).toHaveLength(4);
    expect(rejected).toHaveBeenCalledTimes(3);
  });

  it("keeps the old draft available after starting a new conversation", async () => {
    const { controller } = setup();
    await controller.openConversation("a"); controller.setMessage("Keep old A");
    await controller.startNewConversation();
    expect(controller.getActiveConversationId()).not.toBe("a");
    expect(controller.getComposerState().text).toBe("");
    await controller.openConversation("a"); expect(controller.getComposerState().text).toBe("Keep old A");
  });

  it("does not consume the originating draft when a new-conversation commit rejects", async () => {
    const { controller, provider } = setup();
    await controller.openConversation("a"); controller.setMessage("Keep A on failure");
    vi.spyOn(provider, "prepareStartNew").mockResolvedValue({
      conversationId: "unused", conversationRevision: "1", discard: vi.fn(),
      commit: () => Promise.reject(new Error("Commit unavailable")),
    });
    await expect(controller.startNewConversation()).rejects.toThrow("Commit unavailable");
    expect(controller.getActiveConversationId()).toBe("a");
    expect(controller.getMessages()[0].id).toBe("a0");
    expect(controller.getComposerState().text).toBe("Keep A on failure");
  });

  it("does not render a pending open error after widget teardown", async () => {
    const renderError = vi.fn(() => document.createElement("div"));
    const { controller, provider } = setup({ plugins: [{ id: "teardown-error", renderHistoryOpenError: renderError }] });
    await controller.openConversation("a");
    let fail!: (error: Error) => void;
    vi.spyOn(provider, "getPage").mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = controller.openConversation("b");
    const rejection = expect(pending).rejects.toThrow("Late open failure");
    await flush();
    controller.destroy(); controllers.splice(controllers.indexOf(controller), 1);
    fail(new Error("Late open failure")); await rejection;
    expect(renderError).not.toHaveBeenCalled();
  });

  it("restores the message reading anchor after a slow takeover and leaves it intact on failed fetch", async () => {
    vi.useFakeTimers();
    const { mount, controller, provider } = setup();
    await controller.openConversation("a");
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    Object.defineProperties(body, { clientHeight: { configurable: true, get: () => 100 }, scrollHeight: { configurable: true, get: () => 600 } });
    vi.spyOn(body, "getBoundingClientRect").mockImplementation(() => ({ top: 0, bottom: 100 } as DOMRect));
    const geometry = (node: HTMLElement): DOMRect => ({ top: (node.dataset.messageId === "a0" ? 0 : 200) - body.scrollTop, bottom: (node.dataset.messageId === "a0" ? 100 : 400) - body.scrollTop } as DOMRect);
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.messageId) return geometry(this);
      return originalRect.call(this);
    });
    body.scrollTop = 230;
    body.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, bubbles: true }));
    const originalGetPage = provider.getPage.bind(provider);
    let release!: () => void;
    vi.spyOn(provider, "getPage").mockImplementation(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return originalGetPage(...args); });
    const toB = controller.openConversation("b"); await flush();
    await vi.advanceTimersByTimeAsync(260); release(); await toB;
    const toA = controller.openConversation("a"); await flush();
    await vi.advanceTimersByTimeAsync(260); release(); await toA;
    expect(body.scrollTop).toBe(230);
    expect(mount.querySelector<HTMLElement>('[data-message-id="a1"]')!.getBoundingClientRect().top).toBe(-30);
    provider.failNext("getPage", { code: "unavailable" });
    const failing = controller.openConversation("b"); const rejection = expect(failing).rejects.toMatchObject({ code: "unavailable" });
    await flush(); await vi.advanceTimersByTimeAsync(260); release(); await rejection;
    expect(body.scrollTop).toBe(230);
    expect(controller.getActiveConversationId()).toBe("a");
    expect(mount.querySelector<HTMLElement>('[data-persona-composer-footer]')?.hasAttribute("inert")).not.toBe(true);
  });
});
