// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import pageHtml from "../embedded-host.html?raw";
const mocks = vi.hoisted(() => ({ init: vi.fn(), source: vi.fn() }));
vi.mock("@runtypelabs/persona", () => ({ initAgentWidget: mocks.init, createStaticMentionSource: mocks.source }));
vi.mock("./examples-nav", () => ({ renderExamplesShell: vi.fn() }));
vi.mock("./demo-echo-fetch", () => ({ createDemoEchoFetch: () => vi.fn() }));
async function start() {
  vi.resetModules();
  mocks.source.mockImplementation((source) => source);
  mocks.init.mockImplementation(() => {
    let activeId: string | null = null;
    return { getActiveConversationId: vi.fn(() => activeId), getMessages: vi.fn(() => []), openConversation: vi.fn(async (id: string) => { activeId = id; }), instanceId: `widget-${mocks.init.mock.calls.length}`, destroy: vi.fn(), moveTo: vi.fn(), focusInput: vi.fn(), on: vi.fn(), injectAssistantMessage: vi.fn(), injectComponentDirective: vi.fn(), update: vi.fn(), submitMessage: vi.fn(), getComposerState: vi.fn(() => ({ activeModeIds: [] })), setComposerModes: vi.fn() };
  });
  document.body.innerHTML = pageHtml;
  await import("./embedded-host");
}
function choose(id: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`#host-${id}`)!;
  select.value = value;
  select.dispatchEvent(new Event("change"));
}
afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.clearAllMocks(); document.body.innerHTML = ""; });
describe("embedded host composer scenarios", () => {
  it("compares loaders per assistant without remounting or changing reply indicators", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const support = mocks.init.mock.results[1].value;
    choose("loader", "skeleton");
    expect(research.update).toHaveBeenLastCalledWith({ loadingIndicator: { conversationOpenVariant: "skeleton" } });
    choose("history-delay", "1500");
    choose("target", "support");
    expect(document.querySelector<HTMLSelectElement>("#host-loader")!.value).toBe("spinner");
    expect(document.querySelector<HTMLSelectElement>("#host-history-delay")!.value).toBe("200");
    expect(support.update).not.toHaveBeenCalled();
    choose("target", "research");
    expect(document.querySelector<HTMLSelectElement>("#host-loader")!.value).toBe("skeleton");
    expect(document.querySelector<HTMLSelectElement>("#host-history-delay")!.value).toBe("1500");
    choose("loader", "spinner");
    expect(research.update).toHaveBeenLastCalledWith({ loadingIndicator: { conversationOpenVariant: "spinner" } });
    expect(mocks.init).toHaveBeenCalledTimes(2);
  });
  it("keeps every seeded history message before a newly sent message", async () => {
    await start();
    const provider = mocks.init.mock.calls[0][0].config.features.history.provider;
    const sentAt = Date.now();
    const page = await provider.getPage("host-research-brief", { context: { scope: "browser" } });
    expect(page.messages).toHaveLength(24);
    const timestamps = page.messages.map((message: { createdAt: string }) => Date.parse(message.createdAt));
    expect(timestamps.every((timestamp: number) => timestamp < sentAt)).toBe(true);
    expect(timestamps).toEqual([...timestamps].sort((a: number, b: number) => a - b));
  });
  it.each(["Escape", "return button"])("moves back before hiding the modal using %s", async (returnAction) => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const support = mocks.init.mock.results[1].value;
    const dialog = document.querySelector<HTMLDialogElement>("#host-modal")!;
    const show = vi.fn(() => dialog.setAttribute("open", ""));
    const close = vi.fn(() => dialog.removeAttribute("open"));
    dialog.showModal = show; dialog.close = close;
    document.getElementById("host-move")!.click();
    expect(show).toHaveBeenCalledTimes(1);
    expect(research.moveTo).toHaveBeenLastCalledWith("#host-modal-mount");
    expect(research.focusInput).toHaveBeenCalledTimes(1);
    expect(support.moveTo).not.toHaveBeenCalled(); expect(research.update).not.toHaveBeenCalled();
    // A closed native dialog has no layout; relocation must snapshot the
    // transcript while it is still visible, before close() resets its scroll.
    research.moveTo.mockImplementationOnce(() => expect(dialog.open).toBe(true));
    if (returnAction === "Escape") dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    else document.getElementById("host-return")!.click();
    expect(close).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    expect(research.moveTo).toHaveBeenLastCalledWith(document.getElementById("research"), { preserveFocus: false });
    expect(document.getElementById("host-status")!.textContent).toContain("returned to the sidebar");
    expect(mocks.init).toHaveBeenCalledTimes(2); expect(research.destroy).not.toHaveBeenCalled();
  });
  it("starts with a quiet stacked reference and compares both V4 arrangements", async () => {
    await start();
    expect(mocks.init.mock.calls).toHaveLength(2);
    const config = mocks.init.mock.calls[0][0].config;
    expect(config.composer.layout).toBe("stacked");
    expect(config.composer.placement).toBe("block");
    expect(config.composer.actionOverflow).toMatchObject({ enabled: true, includeBuiltIns: ["attachments", "mentions"] });
    expect(config.composer.actions[0].presentation).toBe("overflow");
    expect(config.composer.modes[0].presentation).toBe("bar");
    expect(config.contextMentions.display).toBe("chip");
    expect(config.attachments.enabled).toBe(true);
    expect(config.messageActions.showQuote).toBe(true);
    choose("defaults", "v4");
    expect(mocks.init.mock.lastCall?.[0].config.composer.layout).toBe("stacked");
    choose("defaults", "v4-single");
    expect(mocks.init.mock.lastCall?.[0].config.composer.layout).toBe("single-row");
    expect(mocks.init.mock.lastCall?.[0].config.future.v5Defaults).toBe(false);
  });
  it("updates only the target and remembers each assistant's mention scenario", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const support = mocks.init.mock.results[1].value;
    choose("scenario", "chips");
    expect(research.update.mock.lastCall?.[0].contextMentions.display).toBe("chip");
    expect(support.update).not.toHaveBeenCalled();
    choose("target", "support");
    expect(document.querySelector<HTMLSelectElement>("#host-scenario")?.value).toBe("reference");
    choose("scenario", "inline");
    const context = support.update.mock.lastCall?.[0].contextMentions;
    expect(context.display).toBe("inline");
    expect(context.sources[0].resolve({ label: "Brief" }).llmAppend).toContain("support sample context");
    choose("target", "research");
    expect(document.querySelector<HTMLSelectElement>("#host-scenario")?.value).toBe("chips");
  });
  it("opts responsive secondaries into measured fit without pinned stress controls", async () => {
    await start();
    choose("scenario", "responsive");
    const config = mocks.init.mock.results[0].value.update.mock.lastCall?.[0];
    expect(config.composer.actionOverflow).toMatchObject({ enabled: true, collapseAutoActions: "fit" });
    expect(config.composer.actions.map((action: { presentation: string }) => action.presentation)).toEqual(["auto", "auto", "auto"]);
    expect(config.composer.actions.map((action: { shortLabel: string }) => action.shortLabel)).toEqual(["Summarize", "Compare", "Next steps"]);
    expect(config.composer.models).toEqual([]);
    expect(config.layout.slots["composer-before-send"]()).toBeNull();
  });
  it("changes only the target theme without remounting and remembers each scheme", async () => {
    await start();
    choose("scheme", "dark");
    const research = mocks.init.mock.results[0].value;
    const support = mocks.init.mock.results[1].value;
    expect(research.update.mock.lastCall?.[0]).toEqual({ colorScheme: "dark" });
    expect(support.update).not.toHaveBeenCalled();
    expect(document.querySelector("#research")!.closest<HTMLElement>(".host-pane")!.dataset.scheme).toBe("dark");
    expect(document.querySelector("#support")!.closest<HTMLElement>(".host-pane")!.dataset.scheme).toBeUndefined();
    choose("target", "support");
    expect(document.querySelector<HTMLSelectElement>("#host-scheme")!.value).toBe("light");
    choose("target", "research");
    expect(document.querySelector<HTMLSelectElement>("#host-scheme")!.value).toBe("dark");
    expect(mocks.init).toHaveBeenCalledTimes(2);
    choose("defaults", "v4");
    expect(mocks.init.mock.calls[mocks.init.mock.calls.length - 2]?.[0].config.colorScheme).toBe("dark");
  });
  it("changes layout only for the selected assistant and remembers it", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const support = mocks.init.mock.results[1].value;
    choose("layout", "single-row");
    expect(research.update.mock.lastCall?.[0].composer.layout).toBe("single-row");
    expect(support.update).not.toHaveBeenCalled();
    choose("target", "support");
    expect(document.querySelector<HTMLSelectElement>("#host-layout")!.value).toBe("stacked");
    choose("target", "research");
    expect(document.querySelector<HTMLSelectElement>("#host-layout")!.value).toBe("single-row");
    expect(mocks.init).toHaveBeenCalledTimes(2);
  });
  it("resizes only the selected host without remounting either widget", async () => {
    await start();
    choose("width", "narrow");
    const research = document.querySelector<HTMLElement>("#research")!.closest<HTMLElement>(".host-pane")!;
    const support = document.querySelector<HTMLElement>("#support")!.closest<HTMLElement>(".host-pane")!;
    expect(research.style.maxWidth).toBe("380px");
    expect(support.style.maxWidth).toBe("");
    expect(mocks.init).toHaveBeenCalledTimes(2);
    expect(mocks.init.mock.results[0].value.update).not.toHaveBeenCalled();
    choose("target", "support");
    expect(document.querySelector<HTMLSelectElement>("#host-width")!.value).toBe("full");
    choose("target", "research");
    expect(document.querySelector<HTMLSelectElement>("#host-width")!.value).toBe("narrow");
    choose("width", "full");
    expect(research.style.maxWidth).toBe("none");
    expect(mocks.init).toHaveBeenCalledTimes(2);
  });
  it("provides long controls and an interactive managed slot without submitting", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    choose("scenario", "crowded");
    const config = research.update.mock.lastCall?.[0];
    expect(config.composer.actions).toHaveLength(2);
    expect(config.composer.models[0].label.length).toBeGreaterThan(30);
    const slot = config.layout.slots["composer-before-send"]();
    const button = slot.element.querySelector("button");
    expect(slot.element.querySelector("input").getAttribute("aria-label")).toBe("research context note");
    button.click();
    expect(slot.element.textContent).toBe("Pinned locally 1");
    expect(research.submitMessage).not.toHaveBeenCalled();
    slot.destroy();
    button.click();
    expect(slot.element.textContent).toBe("Pinned locally 1");
    choose("scenario", "basic");
    const basic = research.update.mock.lastCall?.[0];
    expect(basic.composer.actions).toEqual([]);
    expect(basic.contextMentions.enabled).toBe(false);
    expect(basic.layout.slots["composer-before-send"]()).toBeNull();
  });
});


describe("embedded host conversation continuity", () => {
  it("uses isolated local providers with two scrollable transcripts and keeps sends keyless", async () => {
    await start();
    const researchConfig = mocks.init.mock.calls[0][0].config;
    const supportConfig = mocks.init.mock.calls[1][0].config;
    const provider = researchConfig.features.history.provider;
    expect(provider).not.toBe(supportConfig.features.history.provider);
    expect(researchConfig.customFetch).toBeTypeOf("function");
    expect(researchConfig.persistState).toBe(false);
    const rows = await provider.list({ context: { scope: "browser" } });
    expect(rows.items.map((item: { title: string }) => item.title).sort()).toEqual(["Project brief", "Release notes"]);
    const page = await provider.getPage("host-research-brief", { context: { scope: "browser" } });
    expect(page.messages).toHaveLength(24);
    expect(page.nextCursor).toBeNull();
    expect(page.messages[0].content).toContain("Project brief");
  });
  it("switches conversations through the target's live controller without remounting", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const support = mocks.init.mock.results[1].value;
    choose("conversation", "brief");
    await vi.waitFor(() => expect(document.getElementById("host-status")!.textContent).toContain("reading position belong"));
    expect(research.openConversation).toHaveBeenLastCalledWith("host-research-brief", { busy: "reject" });
    choose("conversation", "notes");
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.disabled).toBe(false));
    expect(research.openConversation).toHaveBeenLastCalledWith("host-research-notes", { busy: "reject" });
    choose("target", "support");
    expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.value).toBe("");
    choose("conversation", "brief");
    await vi.waitFor(() => expect(support.openConversation).toHaveBeenCalledWith("host-support-brief", { busy: "reject" }));
    choose("target", "research");
    expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.value).toBe("notes");
    expect(mocks.init).toHaveBeenCalledTimes(2);
    expect(research.destroy).not.toHaveBeenCalled();
    expect(research.moveTo).not.toHaveBeenCalled();
  });
  it("restores selection after busy rejection and passes the explicit stop policy", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    choose("conversation", "brief");
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.disabled).toBe(false));
    research.openConversation.mockRejectedValueOnce(Object.assign(new Error("Busy"), { code: "conversation_busy" }));
    choose("conversation", "notes");
    await vi.waitFor(() => expect(document.getElementById("host-status")!.textContent).toContain("is busy"));
    expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.value).toBe("brief");
    choose("busy", "stop");
    choose("conversation", "notes");
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.disabled).toBe(false));
    expect(research.openConversation).toHaveBeenLastCalledWith("host-research-notes", { busy: "stop" });
  });

  it("opts into background recovery explicitly and reports conversation-scoped task status", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const config = mocks.init.mock.calls[0][0].config;
    expect(config.backgroundConversations.capabilities).toEqual({ durableExecution: true, readOnlyReplay: true });
    choose("busy", "background");
    choose("conversation", "brief");
    await vi.waitFor(() => expect(research.openConversation).toHaveBeenCalledWith("host-research-brief", { busy: "background" }));
    const report = research.on.mock.calls.find(([event]: [string]) => event === "conversation:executionState")![1];
    report({ conversationId: "host-research-brief", executionId: "run", status: "running", detached: true });
    expect(document.getElementById("host-executions")!.textContent).toContain("Project brief: running · background");
    report({ conversationId: "host-research-brief", executionId: "run", status: "completed", detached: true });
    expect(document.getElementById("host-executions")!.textContent).toContain("Project brief: completed · background");
  });
  it("keeps the current selection on failed opens and allows retry", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    research.openConversation.mockRejectedValueOnce(new Error("Unavailable"));
    choose("conversation", "brief");
    await vi.waitFor(() => expect(document.getElementById("host-status")!.textContent).toContain("current conversation is still available"));
    expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.value).toBe("");
    choose("conversation", "brief");
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.value).toBe("brief"));
    expect(research.openConversation).toHaveBeenCalledTimes(2);
  });
  it("saves completed echo messages to the active local history exactly once", async () => {
    await start();
    const research = mocks.init.mock.results[0].value;
    const provider = mocks.init.mock.calls[0][0].config.features.history.provider;
    choose("conversation", "brief");
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.disabled).toBe(false));
    research.getMessages.mockReturnValue([{ id: "local-reply", role: "assistant", content: "Completed reply" }]);
    const finish = research.on.mock.calls.find(([event]: [string]) => event === "run:finished")[1];
    finish({ outcome: "success" }, { instanceId: "research" });
    finish({ outcome: "success" }, { instanceId: "research" });
    const page = await provider.getPage("host-research-brief", { context: { scope: "browser" } });
    expect(page.messages.filter((message: { id: string }) => message.id === "local-reply")).toHaveLength(1);
    expect(page.messages.at(-1).content).toBe("Completed reply");
  });
});


it("queues a provider failure for only the selected widget and consumes the test control", async () => {
  await start();
  const provider = mocks.init.mock.calls[0][0].config.features.history.provider;
  const supportProvider = mocks.init.mock.calls[1][0].config.features.history.provider;
  const research = mocks.init.mock.results[0].value;
  const activate = research.openConversation.getMockImplementation();
  research.openConversation.mockImplementation(async (id: string) => {
    await provider.getPage(id, { context: { scope: "browser" } });
    await activate(id);
  });
  document.querySelector<HTMLInputElement>("#host-fail-open")!.checked = true;
  choose("conversation", "brief");
  await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.disabled).toBe(false));
  expect(document.querySelector<HTMLInputElement>("#host-fail-open")!.checked).toBe(false);
  expect(document.getElementById("host-status")!.textContent).toContain("Could not open Project brief");
  expect(document.querySelector<HTMLSelectElement>("#host-conversation")!.value).toBe("");
  await expect(provider.getPage("host-research-brief", { context: { scope: "browser" } })).resolves.toHaveProperty("messages");
  await expect(supportProvider.getPage("host-support-brief", { context: { scope: "browser" } })).resolves.toHaveProperty("messages");
});
