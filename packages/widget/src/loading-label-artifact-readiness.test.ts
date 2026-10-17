// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import * as artifacts from "./artifacts-ui-entry";
import * as labels from "./loading-label-runtime";

it("defers supplied artifact adoption until its shared animation runtime is available", async () => {
  vi.resetModules();
  const { provideArtifactsUi, getArtifactsUiSync } = await import("./artifacts-ui-loader");
  const { provideLoadingLabelRuntime } = await import("./loading-label-runtime-loader");
  const initArtifactsUi = vi.fn(artifacts.initArtifactsUi);
  provideArtifactsUi({ ...artifacts, initArtifactsUi });
  expect(initArtifactsUi).not.toHaveBeenCalled(); expect(getArtifactsUiSync()).toBeNull();
  provideLoadingLabelRuntime(labels);
  expect(getArtifactsUiSync()).not.toBeNull();
  expect(initArtifactsUi).toHaveBeenCalledOnce();
  expect(initArtifactsUi.mock.calls[0][0].loadingLabels).toBe(labels);
});

it("retries the missing animation module without refetching an already-loaded artifact renderer", async () => {
  vi.resetModules();
  const { setArtifactsUiLoader, loadArtifactsUi, getArtifactsUiSync } = await import("./artifacts-ui-loader");
  const { setLoadingLabelRuntimeLoader } = await import("./loading-label-runtime-loader");
  const fetchArtifacts = vi.fn(async () => artifacts); setArtifactsUiLoader(fetchArtifacts);
  const fetchLabels = vi.fn<() => Promise<typeof labels>>().mockRejectedValueOnce(new Error("animation offline")).mockResolvedValue(labels);
  setLoadingLabelRuntimeLoader(fetchLabels);
  await expect(loadArtifactsUi()).rejects.toThrow("animation offline");
  expect(getArtifactsUiSync()).toBeNull();
  await expect(loadArtifactsUi()).resolves.toBe(artifacts);
  expect(fetchArtifacts).toHaveBeenCalledOnce(); expect(fetchLabels).toHaveBeenCalledTimes(2);
});

it("keeps direct internal builders synchronous after explicit runtime injection", async () => {
  vi.resetModules();
  const runtime = await import("./loading-label-runtime");
  const activity = await import("./activity-ui");
  activity.initActivityUi(() => null, runtime);
  const custom = document.createElement("strong"); custom.textContent = "Host effect";
  const message = { id: "tool", role: "assistant" as const, content: "", createdAt: "now", variant: "tool" as const,
    toolCall: { id: "tool", name: "Search", status: "running" as const, chunks: [] } };
  const config = { apiUrl: "/chat", future: { v5Defaults: true } };
  expect(activity.createToolBubble(message, config).querySelector(".persona-tool-char")).not.toBeNull();
  const owned = activity.createToolBubble(message, { ...config, toolCall: { renderCollapsedSummary: () => custom } });
  expect(owned.contains(custom)).toBe(true); expect(custom.querySelector(".persona-tool-char")).toBeNull();
  const { initArtifactsUi } = await import("./components/artifacts-deps");
  initArtifactsUi({ componentRegistry: { get: () => undefined }, loadingLabels: runtime });
  const { applyArtifactLoadingStatus } = await import("./utils/artifact-loading-status");
  const status = document.createElement("span"); applyArtifactLoadingStatus(status, "Generating", undefined);
  expect(status.querySelector(".persona-tool-char")).not.toBeNull();
});
