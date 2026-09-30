// @vitest-environment jsdom
import pageHtml from "../v5-preview.html?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ init: vi.fn(), inject: vi.fn(), destroy: vi.fn() }));
vi.mock("@runtypelabs/persona", () => ({ initAgentWidget: mocks.init }));
vi.mock("./examples-nav", () => ({ renderExamplesShell: vi.fn() }));
vi.mock("./demo-echo-fetch", () => ({ createDemoEchoFetch: () => vi.fn() }));
async function start() {
  vi.resetModules();
  mocks.init.mockReturnValue({ injectTestMessage: mocks.inject, destroy: mocks.destroy });
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
  it("starts on real V5 defaults with local replies and stable sample order", async () => {
    await start();
    const config = mocks.init.mock.calls[0][0].config;
    expect(config.future.v5Defaults).toBe(true);
    expect(config.customFetch).toBeTypeOf("function");
    expect(config.features.toolCallDisplay).toEqual({});
    expect(mocks.inject.mock.calls.map(([event]) => event.message.id)).toEqual(["user", "reason", "search", "read", "final"]);
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
