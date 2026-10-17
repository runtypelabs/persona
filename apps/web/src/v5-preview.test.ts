// @vitest-environment jsdom
import pageHtml from "../v5-preview.html?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ init: vi.fn(), inject: vi.fn(), destroy: vi.fn(), upsertArtifact: vi.fn() }));
vi.mock("@runtypelabs/persona", () => ({ initAgentWidget: mocks.init }));
vi.mock("./examples-nav", () => ({ renderExamplesShell: vi.fn() }));
vi.mock("./demo-echo-fetch", () => ({ createDemoEchoFetch: () => vi.fn() }));
async function start() {
  vi.resetModules();
  mocks.init.mockReturnValue({ injectTestMessage: mocks.inject, destroy: mocks.destroy, on: vi.fn(), upsertArtifact: mocks.upsertArtifact });
  document.body.innerHTML = pageHtml;
  await import("./v5-preview");
}
function choose(id: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(`#v5-${id}`)!;
  select.value = value;
  select.dispatchEvent(new Event("change"));
}
afterEach(() => { window.dispatchEvent(new Event("pagehide")); vi.useRealTimers(); vi.clearAllMocks(); document.body.innerHTML = ""; });
describe("V5 preview", () => {
  it("compares scroll glyphs, transitions, and an application-owned animation hook", async () => {
    await start();
    choose("scene", "scroll-control");
    let config = mocks.init.mock.lastCall?.[0].config;
    expect(config.features.scrollBehavior.mode).toBe("none");
    expect(config.customFetch).toBeTypeOf("function");
    choose("scroll-glyph", "dots");
    choose("scroll-transition", "fade");
    choose("scroll-behavior", "smooth");
    choose("scroll-duration", "350");
    config = mocks.init.mock.lastCall?.[0].config;
    expect(config.features.scrollToBottom).toMatchObject({ streamingIndicator: "dots", transition: "fade", scrollBehavior: "smooth", scrollDurationMs: 350 });
    choose("scroll-duration", "0");
    expect(mocks.init.mock.lastCall?.[0].config.features.scrollToBottom.scrollDurationMs).toBe(0);
    choose("scroll-duration", "default");
    expect(mocks.init.mock.lastCall?.[0].config.features.scrollToBottom.scrollDurationMs).toBeUndefined();
    choose("scroll-glyph", "custom");
    expect(mocks.init.mock.lastCall?.[0].config.features.scrollToBottom.renderIcon).toBeTypeOf("function");
    expect(document.querySelector<HTMLElement>("#v5-scroll-hook-note")!.hidden).toBe(false);
  });

  it("compares header glyphs and custom images with public background/padding controls", async () => {
    await start();
    choose("header-icon", "image");
    expect(mocks.init.mock.lastCall?.[0].config.launcher).toMatchObject({ headerIconName: "", iconUrl: "/images/v5-sample-logo.svg" });
    choose("icon-background", "filled");
    choose("icon-padding", "0");
    expect(mocks.init.mock.lastCall?.[0].config.theme.components.header).toMatchObject({ iconBackground: "semantic.colors.primary", iconPadding: "0" });
    choose("header-icon", "sparkles");
    expect(mocks.init.mock.lastCall?.[0].config.launcher.headerIconName).toBe("sparkles");
    expect(mocks.init.mock.lastCall?.[0].config.launcher.iconUrl).toBeUndefined();
    choose("scene", "embedded");
    expect(mocks.init.mock.lastCall?.[0].config.theme.components.input).toBeDefined();
    expect(mocks.init.mock.lastCall?.[0].config.theme.components.header.iconPadding).toBe("0");
    choose("icon-background", "default");
    choose("icon-padding", "default");
    choose("header-icon", "default");
    expect(mocks.init.mock.lastCall?.[0].config.launcher.headerIconName).toBeUndefined();
    expect(mocks.init.mock.lastCall?.[0].config.theme.components.header).toEqual({});
  });
  it("preserves partial output before the sample error and exposes display overrides", async () => {
    await start();
    mocks.inject.mockClear();
    choose("scene", "errors");
    expect(mocks.inject.mock.calls.map(([event]) => event.message.id)).toEqual(["user", "partial", "sample-error"]);
    expect(mocks.inject.mock.lastCall?.[0].message.dispatchError).toBe(true);
    choose("error-display", "bubble");
    expect(mocks.init.mock.lastCall?.[0].config.errorDisplay).toBe("bubble");
  });
  it("registers an artifact behind its transcript card and keeps the disabled setting explicit", async () => {
    await start();
    choose("scene", "artifacts");
    expect(mocks.upsertArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: "theme-checklist", artifactType: "markdown" }));
    expect(mocks.upsertArtifact.mock.lastCall?.[0].transcript).toBe(false);
    expect(mocks.inject.mock.lastCall?.[0].message.rawContent).toContain("PersonaArtifactCard");
    choose("artifacts", "off");
    expect(mocks.init.mock.lastCall?.[0].config.features.artifacts.enabled).toBe(false);
  });
  it("starts on real V5 defaults with local replies and stable sample order", async () => {
    await start();
    const config = mocks.init.mock.calls[0][0].config;
    expect(config.future.v5Defaults).toBe(true);
    expect(config.customFetch).toBeTypeOf("function");
    expect(config.features.toolCallDisplay).toEqual({});
    expect(mocks.inject.mock.calls.map(([event]) => event.message.id)).toEqual(["user", "reason", "search", "read", "final"]);
  });
  it("compares six-field brands in V4 and V5 while preserving explicit scene overrides", async () => {
    await start();
    expect(mocks.init.mock.lastCall?.[0].config.brand).toBeUndefined();
    expect(document.querySelector<HTMLElement>("#v5-brand-summary")!.hidden).toBe(true);
    choose("brand", "editorial");
    const editorial = mocks.init.mock.lastCall?.[0].config.brand;
    expect(Object.keys(editorial)).toEqual(["accent", "neutral", "font", "radius", "density", "elevation"]);
    expect(editorial.neutral).toBe("#171715");
    expect(JSON.parse(document.querySelector("#v5-brand-config")!.textContent!)).toEqual({ brand: editorial });
    choose("version", "v4");
    expect(mocks.init.mock.lastCall?.[0].config).toMatchObject({ brand: editorial, future: { v5Defaults: false } });
    choose("theme", "light");
    expect(mocks.init.mock.lastCall?.[0].config.colorScheme).toBe("light");
    choose("scene", "embedded");
    expect(mocks.init.mock.lastCall?.[0].config.theme.components.input.background).toBe("var(--demo-composer-surface)");
    for (const preset of ["studio", "terminal"]) {
      choose("brand", preset);
      expect(Object.keys(mocks.init.mock.lastCall?.[0].config.brand)).toHaveLength(6);
    }
    choose("brand", "default");
    expect(mocks.init.mock.lastCall?.[0].config.brand).toBeUndefined();
    expect(document.querySelector<HTMLElement>("#v5-brand-summary")!.hidden).toBe(true);
  });
  it("switches suggestion edges without dropping starter settings", async () => {
    await start();
    choose("suggestion-edges", "fade");
    expect(mocks.init.mock.lastCall?.[0].config.suggestions.followUps.edgeStyle).toBe("fade");
    expect(mocks.init.mock.lastCall?.[0].config.suggestions.starters.items).toEqual([]);
  });
  it("demonstrates a bounded embedded host using public configuration", async () => {
    await start();
    choose("scene", "embedded");
    const config = mocks.init.mock.lastCall?.[0].config;
    expect(config.launcher).toEqual({ enabled: false });
    expect(config.layout.embedded).toBe(true);
    expect(config.composer.placement).toBe("block");
    expect(config.theme.components.input.background).toBe("var(--demo-composer-surface)");
    expect(document.querySelector(".v5-embedded-frame")).not.toBeNull();
    expect(mocks.inject.mock.calls.some(([event]) => event.message.id === "embedded-code")).toBe(true);
    choose("scene", "welcome");
    expect(document.querySelector(".v5-embedded-frame")).toBeNull();
  });
  it("compares V4 and opts into descriptive labels without changing the default", async () => {
    await start();
    choose("version", "v4");
    expect(mocks.init.mock.lastCall?.[0].config.future.v5Defaults).toBe(false);
    choose("group", "descriptive");
    expect(mocks.init.mock.lastCall?.[0].config.toolCall.renderGroupedSummary).toBeTypeOf("function");
  });
  it("shows follow-ups after the loading sample and cancels stale transitions", async () => {
    vi.useFakeTimers();
    await start();
    choose("scene", "streaming");
    const suggestions = mocks.inject.mock.calls.find(([event]) => event.message.toolCall?.name === "suggest_replies")?.[0].message.toolCall.args.suggestions;
    expect(suggestions).toHaveLength(6);
    document.querySelector<HTMLButtonElement>("#v5-stream")!.click();
    expect(mocks.inject.mock.lastCall?.[0].message).toMatchObject({ content: "", streaming: true });
    vi.advanceTimersByTime(2400);
    expect(mocks.inject.mock.lastCall?.[0].message.content).toContain("locally simulated");
    choose("scene", "welcome");
    const count = mocks.inject.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(mocks.inject).toHaveBeenCalledTimes(count);
  });
  it("cancels the sample stream when another scene is selected", async () => {
    vi.useFakeTimers();
    await start();
    document.querySelector<HTMLButtonElement>("#v5-stream")!.click();
    vi.advanceTimersByTime(1700);
    choose("scene", "welcome");
    const count = mocks.inject.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(mocks.inject).toHaveBeenCalledTimes(count);
    expect(document.querySelector<HTMLButtonElement>("#v5-stream")!.disabled).toBe(false);
  });
  it("shows each approval outcome and keeps decisions local", async () => {
    vi.useFakeTimers();
    await start();
    choose("scene", "approval");
    const approvals = mocks.inject.mock.calls.map(([event]) => event.message.approval).filter(Boolean);
    expect(approvals.map((approval) => approval.id)).toEqual(["running", "completed", "failed", "denied", "unknown", "interactive"]);
    expect(approvals.find((approval) => approval.id === "unknown").toolCallId).toBeUndefined();
    const config = mocks.init.mock.lastCall?.[0].config;
    expect(config.approval.approveLabel).toBe("Allow once");
    expect(config.plugins).toBeUndefined();
    const response = await config.approval.onDecision({ approvalId: "interactive", toolName: "Search sample documentation" }, "approved");
    expect(response.status).toBe(204);
    expect(mocks.inject.mock.lastCall?.[0].message.toolCall.status).toBe("running");
    vi.advanceTimersByTime(1800);
    expect(mocks.inject.mock.lastCall?.[0].message.toolCall.status).toBe("complete");
    const count = mocks.inject.mock.calls.length;
    await config.approval.onDecision({ approvalId: "interactive" }, "denied");
    expect(mocks.inject).toHaveBeenCalledTimes(count);
  });
  it("cleans up custom approval controls and distinguishes permission from execution", async () => {
    await start();
    choose("scene", "approval-custom");
    const render = mocks.init.mock.lastCall?.[0].config.plugins[0].renderApproval;
    const approve = vi.fn();
    const controller = new AbortController();
    const context = { message: { approval: { status: "pending", toolName: "Sample search" } }, approve, deny: vi.fn(), signal: controller.signal };
    const pending = render(context);
    expect(pending.textContent).toContain("Allow once");
    controller.abort();
    pending.querySelector("button").click();
    expect(approve).not.toHaveBeenCalled();
    const resolved = render({ ...context, message: { approval: { status: "approved", toolName: "Sample search" } } });
    expect(resolved.textContent).toContain("Approved · execution unknown");
    expect(resolved.querySelector("button")).toBeNull();
    const completed = render({ ...context, message: { approval: { status: "approved", toolName: "Sample search" } }, execution: { status: "completed", toolCallId: "sample" } });
    expect(completed.textContent).toContain("Approved · completed");
  });
  it("cancels simulated approval execution when changing scenes", async () => {
    vi.useFakeTimers();
    await start();
    choose("scene", "approval");
    await mocks.init.mock.lastCall?.[0].config.approval.onDecision({ approvalId: "interactive", toolName: "Sample search" }, "approved");
    choose("scene", "welcome");
    const count = mocks.inject.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(mocks.inject).toHaveBeenCalledTimes(count);
  });

});


it("compares compact approvals, retained cards and legacy traces independently", async () => {
  await start();
  choose("scene", "approval");
  expect(mocks.init.mock.lastCall?.[0].config.approval.resolvedDisplay).toBeUndefined();
  for (const value of ["row", "status-line", "trace"]) {
    choose("approval-display", value);
    expect(mocks.init.mock.lastCall?.[0].config.approval.resolvedDisplay).toBe(value);
  }
  choose("approval-display", "default");
  expect(mocks.init.mock.lastCall?.[0].config.approval.resolvedDisplay).toBeUndefined();
});
