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
  mocks.init.mockImplementation(() => ({ instanceId: `widget-${mocks.init.mock.calls.length}`, destroy: vi.fn(), moveTo: vi.fn(), focusInput: vi.fn(), on: vi.fn(), injectAssistantMessage: vi.fn(), injectComponentDirective: vi.fn(), update: vi.fn(), submitMessage: vi.fn(), getComposerState: vi.fn(() => ({ activeModeIds: [] })), setComposerModes: vi.fn() }));
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
