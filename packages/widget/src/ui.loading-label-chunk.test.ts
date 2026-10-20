// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as labels from "./loading-label-runtime";
import * as activity from "./activity-ui";
import type { createAgentExperience } from "./ui";

let controller: ReturnType<typeof createAgentExperience> | undefined;
beforeEach(() => { vi.resetModules(); window.scrollTo = vi.fn(); });
afterEach(() => { controller?.destroy(); controller = undefined; document.body.replaceChildren(); });
const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const base = { apiUrl: "/chat", launcher: { enabled: false }, persistState: false, voiceRecognition: { enabled: false },
  features: { showToolCalls: false, showReasoning: false, artifacts: { enabled: false } } };
const mount = () => { const root = document.createElement("div"); document.body.append(root); return root; };
const inject = () => controller!.injectTestMessage({ type: "message", message: {
  id: "answer", role: "assistant", content: "", streaming: true, createdAt: "now",
} });

it("prepares only the small runtime before revealing a text-only animated label", async () => {
  const download = pending<typeof labels>();
  const { setLoadingLabelRuntimeLoader } = await import("./loading-label-runtime-loader");
  const { setActivityUiLoader } = await import("./activity-ui-loader");
  const activityFetch = vi.fn(async () => activity); setActivityUiLoader(activityFetch);
  const fetch = vi.fn(() => download.promise); setLoadingLabelRuntimeLoader(fetch);
  const { createAgentExperience } = await import("./ui");
  const root = mount(); const destroy = vi.fn();
  const animate = vi.fn(({ element }) => { expect(element.isConnected).toBe(true); element.textContent = "Ready effect"; return { destroy }; });
  controller = createAgentExperience(root, { ...base, loadingIndicator: { variant: "label" }, loadingLabel: { animate } });
  inject();
  expect(root.hasAttribute("data-persona-preparing")).toBe(true);
  expect(animate).not.toHaveBeenCalled();
  download.resolve(labels);
  await controller.ready;
  expect(activityFetch).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
  expect(root.hasAttribute("data-persona-preparing")).toBe(false);
  expect(root.querySelector("[data-persona-loading-label]")?.textContent).toBe("Ready effect");
  expect(animate).toHaveBeenCalledOnce();
  controller.destroy(); controller = undefined; expect(destroy).toHaveBeenCalledOnce();
});

it("retains the old UI when animation loading fails after activity is ready, then retries", async () => {
  const { setLoadingLabelRuntimeLoader } = await import("./loading-label-runtime-loader");
  const fetch = vi.fn<() => Promise<typeof labels>>().mockRejectedValueOnce(new Error("animation offline")).mockResolvedValue(labels);
  setLoadingLabelRuntimeLoader(fetch);
  const { provideActivityUi } = await import("./activity-ui-loader"); provideActivityUi(activity);
  const { createAgentExperience } = await import("./ui");
  const root = mount();
  controller = createAgentExperience(root, base);
  await controller.ready; inject();
  const dots = root.querySelector(".persona-animate-typing"); expect(dots).not.toBeNull();
  const animate = vi.fn();
  controller.update({ features: { showToolCalls: true }, loadingIndicator: { variant: "label" }, loadingLabel: { animate } });
  await expect(controller.ready).rejects.toThrow("animation offline");
  expect(root.querySelector(".persona-animate-typing")).toBe(dots);
  expect(root.inert).not.toBe(true); expect(animate).not.toHaveBeenCalled();
  controller.update({}); await controller.ready;
  expect(fetch).toHaveBeenCalledTimes(2); expect(animate).toHaveBeenCalledOnce();
  expect(root.querySelector(".persona-animate-typing")).toBeNull();
});

it("never creates a hook lifecycle for a destroyed animation waiter", async () => {
  const download = pending<typeof labels>();
  const { setLoadingLabelRuntimeLoader } = await import("./loading-label-runtime-loader"); setLoadingLabelRuntimeLoader(() => download.promise);
  const { createAgentExperience } = await import("./ui");
  const root = mount(); const animate = vi.fn(); const createLifecycle = vi.fn(labels.createLoadingLabelLifecycle);
  controller = createAgentExperience(root, { ...base, loadingIndicator: { variant: "label" }, loadingLabel: { animate } });
  inject(); const readiness = controller.ready;
  controller.destroy(); controller = undefined;
  download.resolve({ ...labels, createLoadingLabelLifecycle: createLifecycle });
  await expect(readiness).rejects.toThrow("Widget destroyed before ready"); await flush();
  expect(createLifecycle).not.toHaveBeenCalled(); expect(animate).not.toHaveBeenCalled();
});

it.each([{ loadingIndicator: { variant: "dots" as const } }, { loadingIndicator: { variant: "label" as const }, loadingLabel: { animation: "none" as const, animate: vi.fn() } }])(
  "keeps V4 dots and plain labels on their no-animation-download paths", async settings => {
    const { setLoadingLabelRuntimeLoader } = await import("./loading-label-runtime-loader");
    const fetch = vi.fn(async () => labels); setLoadingLabelRuntimeLoader(fetch);
    const { createAgentExperience } = await import("./ui");
    controller = createAgentExperience(mount(), { ...base, ...settings });
    await controller.ready; inject();
    expect(fetch).not.toHaveBeenCalled();
  },
);


it.each([{ showToolCalls: true, showReasoning: false }, { showToolCalls: false, showReasoning: true }])(
  "prepares the injected runtime for activity even with dots and none", async features => {
    const { setLoadingLabelRuntimeLoader } = await import("./loading-label-runtime-loader");
    const { setActivityUiLoader } = await import("./activity-ui-loader");
    const fetch = vi.fn(async () => labels); setLoadingLabelRuntimeLoader(fetch);
    const activityFetch = vi.fn(async () => activity); setActivityUiLoader(activityFetch);
    const { createAgentExperience } = await import("./ui");
    controller = createAgentExperience(mount(), { ...base, features: { ...base.features, ...features }, loadingLabel: { animation: "none" } });
    await controller.ready;
    expect(fetch).toHaveBeenCalledOnce(); expect(activityFetch).toHaveBeenCalledOnce();
  },
);
