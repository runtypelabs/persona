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

  it("shows transient connection and error states, hiding idle and streaming", () => {
    const { controller, status, form } = mountWidget({
      future: { v5Defaults }, statusIndicator: { mode: "transient", errorText: "Try again" },
    });
    expect(status.nextElementSibling).toBe(form);
    for (const state of ["connecting", "connected", "error", "idle"] as const) {
      controller.injectTestMessage({ type: "status", status: state });
      expect(status.style.display, state).toBe(state === "connecting" || state === "error" ? "" : "none");
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
