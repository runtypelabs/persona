// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig } from "./types";
import { isStatusIndicatorVisible } from "./utils/status-indicator";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const mountWidget = (config: Partial<AgentWidgetConfig>) => {
  window.scrollTo = vi.fn();
  const mount = document.createElement("div");
  document.body.append(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "/dispatch", persistState: false, launcher: { enabled: false }, ...config,
  });
  controllers.push(controller);
  return {
    controller,
    status: mount.querySelector<HTMLElement>("[data-persona-composer-status]")!,
    form: mount.querySelector<HTMLElement>("[data-persona-composer-form]")!,
  };
};
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe.each([false, true])("status indicator (v5=%s)", (v5Defaults) => {
  it("selects the default mode and placement", () => {
    const { status, form } = mountWidget({ future: { v5Defaults } });
    expect(status.style.display).toBe(v5Defaults ? "none" : "");
    expect(status.classList.contains(v5Defaults ? "persona-text-left" : "persona-text-right")).toBe(true);
    expect(v5Defaults ? status.nextElementSibling : form.nextElementSibling)
      .toBe(v5Defaults ? form : status);
  });

  it("shows interruptions while hiding normal request activity", () => {
    const { controller, status, form } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "transient", errorText: "Try again" },
    });
    expect(status.nextElementSibling).toBe(form);
    for (const state of ["connecting", "connected", "error", "idle"] as const) {
      controller.injectTestMessage({ type: "status", status: state });
      expect(status.style.display, state).toBe(state === "error" ? "" : "none");
      if (state === "error") expect(status.textContent).toBe("Try again");
    }
  });

  it.each([false, true])("hides a terminal run failure in transient mode (custom parser=%s)", async (customParser) => {
    const { controller, status } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "transient" },
      parseSSEEvent: customParser ? () => ({ error: "Model unavailable" }) : undefined,
    });
    await controller.connectStream(new Response(
      'event: execution_error\ndata: {"type":"execution_error","kind":"agent","error":"Model unavailable"}\n\n',
    ).body!);
    expect(status.style.display).toBe("none");
    expect(status.textContent).not.toBe("Offline");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Model unavailable"));
    expect(document.body.textContent).toContain("This run failed");
  });

  it("honors explicit visibility and permits live mode changes", () => {
    const { controller, status, form } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "always", idleText: "Ready" },
    });
    expect(form.nextElementSibling).toBe(status);
    expect(status.style.display).toBe("");
    controller.update({ statusIndicator: { mode: "transient" } });
    expect(status.nextElementSibling).toBe(form);
    expect(status.style.display).toBe("none");
    controller.update({ statusIndicator: { visible: false } });
    controller.injectTestMessage({ type: "status", status: "connecting" });
    expect(status.style.display).toBe("none");
    controller.update({ statusIndicator: { mode: "always", visible: true } });
    expect(form.nextElementSibling).toBe(status);
    expect(status.style.display).toBe("");
  });

  it.each(["left", "center", "right"] as const)("preserves explicit %s alignment and updates it live", (align) => {
    const { controller, status } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "transient", align },
    });
    expect(status.classList.contains(`persona-text-${align}`)).toBe(true);
    controller.update({ statusIndicator: { mode: "always", align: "center" } });
    expect(status.classList.contains("persona-text-center")).toBe(true);
    expect(status.classList.contains("persona-text-right")).toBe(false);
  });

  it("keeps default transient alignment after an update without align", () => {
    const { controller, status } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "transient" },
    });
    controller.update({ statusIndicator: { mode: "transient" } });
    expect(status.classList.contains("persona-text-left")).toBe(true);
    expect(status.classList.contains("persona-text-right")).toBe(false);
    controller.update({ statusIndicator: { mode: "always" } });
    expect(status.classList.contains("persona-text-right")).toBe(true);
  });

  it("keeps a composer lock reason readable in transient mode", () => {
    const { controller, status } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "transient" },
      composer: { inputDisabled: { reason: "Sign in to continue" } },
    });
    expect(status.textContent).toBe("Sign in to continue");
    expect(status.style.display).toBe("");
    controller.injectTestMessage({ type: "status", status: "connected" });
    expect(status.textContent).toBe("Sign in to continue");
    controller.update({ composer: { inputDisabled: false } });
    expect(status.style.display).toBe("none");
  });
});

it.each(["paused", "resuming"])("shows reconnect status %s in transient mode", (status) => {
  expect(isStatusIndicatorVisible({ mode: "transient" }, status)).toBe(true);
  expect(isStatusIndicatorVisible({ mode: "transient", visible: false }, status)).toBe(false);
});


const recoveryFrame = (id: number, type: string, data: Record<string, unknown> = {}) =>
  `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const droppedResponse = () => new Response(recoveryFrame(1, "text_delta", {
  id: "partial", delta: "Partial response", executionId: "exec-notice",
}));
const recoveredResponse = () => new Response(
  recoveryFrame(2, "text_delta", { id: "partial", delta: " continued", executionId: "exec-notice" }) +
  recoveryFrame(3, "execution_complete", { kind: "agent", success: true }),
);

it.each([false, true])("offers accessible same-response recovery (composer bar=%s)", async (composerBar) => {
  const reconnect = vi.fn(async () => new Response(null, { status: 503 }));
  const dispatch = vi.fn();
  const { controller, status, form } = mountWidget({
    future: { v5Defaults: true }, customFetch: dispatch, reconnectStream: reconnect,
    reconnect: { maxAttempts: 1 },
    launcher: { enabled: true, mountMode: composerBar ? "composer-bar" : "floating" },
  });
  await controller.connectStream(droppedResponse().body!);
  await vi.waitFor(() => expect(status.textContent).toContain("Couldn’t reconnect"));
  expect(status.style.display).toBe("");
  expect(status.nextElementSibling).toBe(form);
  expect(status.classList.contains("persona-connection-notice")).toBe(true);
  expect(status.getAttribute("role")).toBe("status");
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(status.textContent).not.toContain("Offline");
  expect(document.body.textContent).not.toContain("This run failed");
  expect(document.body.textContent).not.toContain("Response complete.");

  let resolve!: (response: Response) => void;
  reconnect.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  const originalAction = status.querySelector<HTMLButtonElement>("[data-persona-reconnect]")!;
  originalAction.focus();
  originalAction.click();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  const busy = status.querySelector<HTMLButtonElement>("[data-persona-reconnect]")!;
  expect(busy).toBe(originalAction);
  expect(document.activeElement).toBe(originalAction);
  expect(busy.disabled).toBe(true);
  expect(busy.getAttribute("aria-busy")).toBe("true");
  expect(busy.getAttribute("aria-label")).toContain(busy.textContent);
  expect(status.textContent).toContain("Reconnecting");
  busy.click();
  controller.reconnect();
  expect(reconnect).toHaveBeenCalledTimes(2);
  resolve(recoveredResponse());
  await vi.waitFor(() => expect(status.style.display).toBe("none"));
  expect(status.querySelector("[data-persona-reconnect]")).toBeNull();
  expect(reconnect).toHaveBeenLastCalledWith(expect.objectContaining({ executionId: "exec-notice", after: "1" }));
  expect(dispatch).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(document.body.textContent).toContain("Partial response continued"));
});

it("allows the waiting retry to be accelerated without adding a second request", async () => {
  const reconnect = vi.fn(async () => new Response(null, { status: 503 }));
  const { controller, status } = mountWidget({
    future: { v5Defaults: true }, reconnectStream: reconnect,
    reconnect: { maxAttempts: 2, backoffMs: [10000] },
    statusIndicator: { pausedText: "Waiting to reconnect", resumingText: "Attaching again" },
  });
  await controller.connectStream(droppedResponse().body!);
  await vi.waitFor(() => expect(status.textContent).toContain("Waiting to reconnect"));
  const action = status.querySelector<HTMLButtonElement>("[data-persona-reconnect]")!;
  expect(action.disabled).toBe(false);
  expect(action.getAttribute("aria-label")).toBe("Reconnect now");
  reconnect.mockResolvedValueOnce(recoveredResponse());
  action.click();
  await vi.waitFor(() => expect(status.style.display).toBe("none"));
  expect(reconnect).toHaveBeenCalledTimes(2);
});

it.each([false, true])("preserves configured labels, visibility and lock priority during recovery (composer bar=%s)", async (composerBar) => {
  const { controller, status } = mountWidget({
    future: { v5Defaults: true }, reconnectStream: async () => new Response(null, { status: 503 }),
    reconnect: { maxAttempts: 1 }, statusIndicator: { errorText: "Custom interruption", align: "center" },
    launcher: { enabled: true, mountMode: composerBar ? "composer-bar" : "floating" },
    composer: { inputDisabled: { reason: "Sign in first" } },
  });
  await controller.connectStream(droppedResponse().body!);
  await vi.waitFor(() => expect(controller.getState().streaming).toBe(false));
  expect(status.textContent).toBe("Sign in first");
  expect(status.querySelector("[data-persona-reconnect]")).toBeNull();
  controller.update({ composer: { inputDisabled: false } });
  expect(status.textContent).toContain("Custom interruption");
  expect(status.classList.contains("persona-text-center")).toBe(true);
  controller.update({ statusIndicator: { visible: false } });
  expect(status.style.display).toBe("none");
  controller.update({ statusIndicator: { visible: true, mode: "always" } });
  expect(status.style.display).toBe("");
  expect(status.querySelector("[data-persona-reconnect]")).not.toBeNull();
});

it("shows generic transport errors as interruptions without offering an unavailable replay", () => {
  const { controller, status } = mountWidget({ future: { v5Defaults: true } });
  controller.injectTestMessage({ type: "status", status: "error" });
  expect(status.textContent).toBe("Connection interrupted");
  expect(status.style.display).toBe("");
  expect(status.querySelector("[data-persona-reconnect]")).toBeNull();
});


it("reuses one working indicator while a normal request is connecting", async () => {
  const { controller, status } = mountWidget({
    future: { v5Defaults: true }, customFetch: () => new Promise<Response>(() => {}),
  });
  controller.submitMessage("Hello");
  await vi.waitFor(() => expect(document.querySelectorAll('[data-typing-indicator="true"]')).toHaveLength(1));
  expect(status.style.display).toBe("none");
  expect(status.querySelector("[data-persona-reconnect]")).toBeNull();
  expect(document.querySelector('[data-typing-indicator="true"]')?.textContent).toContain("Thinking");
});


it("hides recovery chrome once the resumed stream is connected", async () => {
  const reconnect = vi.fn(async () => new Response(null, { status: 503 }));
  const { controller, status } = mountWidget({
    future: { v5Defaults: true }, reconnectStream: reconnect, reconnect: { maxAttempts: 1 },
  });
  await controller.connectStream(droppedResponse().body!);
  await vi.waitFor(() => expect(status.textContent).toContain("Couldn’t reconnect"));
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  reconnect.mockResolvedValueOnce(new Response(new ReadableStream({ start(next) { stream = next; } })));
  const action = status.querySelector<HTMLButtonElement>("[data-persona-reconnect]")!;
  action.focus();
  action.click();
  stream.enqueue(new TextEncoder().encode(recoveryFrame(2, "text_delta", {
    id: "partial", delta: " continuing", executionId: "exec-notice",
  })));
  await vi.waitFor(() => expect(status.style.display).toBe("none"));
  expect(controller.getState().streaming).toBe(true);
  expect(status.querySelector("[data-persona-reconnect]")).toBeNull();
  expect(reconnect).toHaveBeenCalledTimes(2);
  stream.enqueue(new TextEncoder().encode(recoveryFrame(3, "execution_complete", { kind: "agent", success: true })));
  stream.close();
});

it("keeps the same focused action available after a manual attempt fails", async () => {
  const { controller, status } = mountWidget({
    future: { v5Defaults: true }, reconnectStream: async () => new Response(null, { status: 503 }),
    reconnect: { maxAttempts: 1 },
  });
  await controller.connectStream(droppedResponse().body!);
  await vi.waitFor(() => expect(status.textContent).toContain("Couldn’t reconnect"));
  const action = status.querySelector<HTMLButtonElement>("[data-persona-reconnect]")!;
  action.focus();
  action.click();
  await vi.waitFor(() => expect(action.disabled).toBe(false));
  expect(status.querySelector("[data-persona-reconnect]")).toBe(action);
  expect(document.activeElement).toBe(action);
});


it.each([false, true])("keeps healthy composer-bar status hidden unless always mode is explicit (v5=%s)", (v5Defaults) => {
  const { controller, status } = mountWidget({
    future: { v5Defaults }, launcher: { enabled: true, mountMode: "composer-bar" },
  });
  expect(status.style.display).toBe("none");
  controller.injectTestMessage({ type: "status", status: "connecting" });
  expect(status.style.display).toBe("none");
  controller.injectTestMessage({ type: "status", status: "error" });
  expect(status.style.display).toBe("");
  controller.update({ statusIndicator: { mode: "always" } });
  controller.injectTestMessage({ type: "status", status: "idle" });
  expect(status.style.display).toBe("");
  expect(status.textContent).toBe("Online");
});


it.each(["open", "rendered", "queued"] as const)("emits one completion after terminal-only manual replay (text phase=%s)", async (textPhase) => {
  const reconnect = vi.fn(async () => new Response(null, { status: 503 }));
  const { controller, status } = mountWidget({
    future: { v5Defaults: true }, reconnectStream: reconnect, reconnect: { maxAttempts: 1 },
  });
  const completed = vi.fn();
  controller.on("assistant:complete", completed);
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const reading = controller.connectStream(new ReadableStream({ start(next) { stream = next; } }));
  const encoder = new TextEncoder();
  stream.enqueue(encoder.encode(recoveryFrame(1, "text_delta", { id: "partial", delta: "Response", executionId: "exec-notice" })));
  await vi.waitFor(() => expect(document.body.textContent).toContain("Response"));
  if (textPhase !== "open") {
    stream.enqueue(encoder.encode(recoveryFrame(2, "text_complete", { id: "partial", executionId: "exec-notice" })));
    if (textPhase === "rendered") await vi.waitFor(() => expect(completed).toHaveBeenCalledOnce());
  }
  stream.close();
  await reading;
  await vi.waitFor(() => expect(status.textContent).toContain("Couldn’t reconnect"));
  expect(completed).toHaveBeenCalledTimes(textPhase === "open" ? 0 : 1);
  reconnect.mockResolvedValueOnce(new Response(recoveryFrame(3, "execution_complete", { kind: "agent", success: true })));
  controller.reconnect();
  await vi.waitFor(() => expect(controller.getState().streaming).toBe(false));
  await vi.waitFor(() => expect(status.style.display).toBe("none"));
  expect(completed).toHaveBeenCalledOnce();
});
