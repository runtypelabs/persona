// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetToolCallLoadingAnimation, LoadingLabelAnimationContext } from "../types";
import { createTypingIndicator } from "../components/message-bubble";
import { createToolBubble } from "../components/tool-bubble";
import { createReasoningBubble } from "../components/reasoning-bubble";
import { createActivityGroup } from "../components/activity-row";
import { createLoadingLabelLifecycle } from "./loading-label-lifecycle";
import { morphMessages } from "./morph";

const tool: AgentWidgetMessage = { id: "tool", role: "assistant", content: "", createdAt: "2026-01-01", variant: "tool", toolCall: { id: "tool", name: "Search", status: "running", chunks: ["Looking"] } };
const reasoning: AgentWidgetMessage = { ...tool, id: "reason", variant: "reasoning", toolCall: undefined, reasoning: { id: "reason", status: "pending", chunks: [] } };
const config: AgentWidgetConfig = { apiUrl: "/chat", future: { v5Defaults: true } };
const modes: AgentWidgetToolCallLoadingAnimation[] = ["none", "pulse", "shimmer", "shimmer-color", "rainbow"];
const surfaces = {
  waiting: (cfg: AgentWidgetConfig) => createTypingIndicator(cfg),
  tool: (cfg: AgentWidgetConfig) => createToolBubble(tool, cfg),
  reasoning: (cfg: AgentWidgetConfig) => createReasoningBubble(reasoning, cfg),
  "tool-group": (cfg: AgentWidgetConfig) => createActivityGroup(tool, cfg, false, "Using two tools").bubble,
};
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(Object.entries(surfaces))("shared loading label: %s", (kind, render) => {
  it.each(modes)("uses %s and shared timing/colors", animation => {
    const root = render({ ...config, loadingLabel: { animation, duration: 3210, color: "#123456", secondaryColor: "#abcdef" } });
    const label = root.querySelector<HTMLElement>("[data-persona-loading-label]");
    if (animation === "none") { expect(label).toBeNull(); expect(root.querySelector(".persona-tool-char")).toBeNull(); return; }
    expect(label?.dataset.personaLoadingLabel).toBe(kind);
    expect(label?.classList.contains(`persona-tool-loading-${animation}`)).toBe(true);
    expect(label?.style.getPropertyValue("--persona-tool-anim-duration")).toBe("3210ms");
    expect(label?.style.getPropertyValue("--persona-tool-anim-color")).toBe("#123456");
    expect(label?.style.getPropertyValue("--persona-tool-anim-secondary-color")).toBe("#abcdef");
    expect(Boolean(label?.querySelector(".persona-tool-char"))).toBe(animation !== "pulse");
  });
});

it("keeps waiting animation inside one row child and retains legacy defaults", () => {
  const root = createTypingIndicator(config);
  expect(root.classList.contains("persona-activity-header")).toBe(true);
  expect(root.children).toHaveLength(2);
  expect(root.firstElementChild?.classList.contains("persona-activity-icon")).toBe(true);
  expect(root.lastElementChild?.classList.contains("persona-tool-loading-shimmer")).toBe(true);
  expect(root.querySelectorAll(":scope > .persona-tool-char")).toHaveLength(0);
  expect(createTypingIndicator({ loadingIndicator: { variant: "label" }, features: { toolCallDisplay: { loadingAnimation: "none" } } }).querySelector(".persona-tool-loading-shimmer")).not.toBeNull();
  expect(createTypingIndicator().querySelectorAll(".persona-animate-typing")).toHaveLength(3);
  expect(createToolBubble(tool).querySelector("[data-persona-loading-label]")).toBeNull();
  expect(createReasoningBubble(reasoning).querySelector("[data-persona-loading-label]")).toBeNull();
});

it("retains local controls unless a shared override is supplied", () => {
  const local: AgentWidgetConfig = { ...config, features: { toolCallDisplay: { loadingAnimation: "rainbow" }, reasoningDisplay: { loadingAnimation: "pulse" } }, toolCall: { loadingAnimationDuration: 4444 }, reasoning: { loadingAnimationDuration: 3333 } };
  expect(createToolBubble(tool, local).querySelector<HTMLElement>(".persona-tool-loading-rainbow")?.style.getPropertyValue("--persona-tool-anim-duration")).toBe("4444ms");
  expect(createActivityGroup(tool, local, false, "Using tools").bubble.querySelector(".persona-tool-loading-rainbow")).not.toBeNull();
  expect(createReasoningBubble(reasoning, local).querySelector<HTMLElement>(".persona-tool-loading-pulse")?.style.getPropertyValue("--persona-tool-anim-duration")).toBe("3333ms");
  const shared = { ...local, loadingLabel: { animation: "shimmer" as const } };
  expect(createToolBubble(tool, shared).querySelector(".persona-tool-loading-shimmer")).not.toBeNull();
  expect(createReasoningBubble(reasoning, shared).querySelector(".persona-tool-loading-shimmer")).not.toBeNull();
});

it("keeps templates, live timers and custom HTMLElement ownership", () => {
  const cfg: AgentWidgetConfig = { ...config, loadingLabel: { animation: "rainbow" }, toolCall: { activeTextTemplate: "**Calling** {toolName} ~{duration}~" }, reasoning: { activeTextTemplate: "*Thinking* ~{duration}~" } };
  for (const root of [createToolBubble(tool, cfg), createReasoningBubble(reasoning, cfg)]) {
    expect(root.querySelector("[data-tool-elapsed] .persona-tool-char")).toBeNull();
    expect(root.querySelector("[data-tool-elapsed]")).not.toBeNull();
    expect(root.querySelector(".persona-tool-text-bold, .persona-tool-text-italic")).not.toBeNull();
  }
  const custom = () => document.createElement("strong");
  expect(createToolBubble(tool, { ...cfg, toolCall: { renderCollapsedSummary: custom } }).querySelector("[data-persona-loading-label]")).toBeNull();
  expect(createReasoningBubble(reasoning, { ...cfg, reasoning: { renderCollapsedSummary: custom } }).querySelector("[data-persona-loading-label]")).toBeNull();
  expect(createActivityGroup(tool, cfg, false, custom()).bubble.querySelector("[data-persona-loading-label]")).toBeNull();
  expect(createToolBubble({ ...tool, toolCall: { ...tool.toolCall!, status: "complete" } }, cfg).querySelector("[data-persona-loading-label]")).toBeNull();
  expect(createReasoningBubble({ ...reasoning, reasoning: { ...reasoning.reasoning!, status: "complete" } }, cfg).querySelector("[data-persona-loading-label]")).toBeNull();
  expect(createActivityGroup({ ...tool, toolCall: { ...tool.toolCall!, status: "complete" } }, cfg, false, "Used tools").bubble.querySelector("[data-persona-loading-label]")).toBeNull();
});

it("preserves builtin nodes on unrelated updates and applies mode/style changes", () => {
  const root = document.createElement("div");
  const commit = (cfg: AgentWidgetConfig) => { const next = document.createElement("div"); next.append(createToolBubble(tool, cfg)); morphMessages(root, next); };
  commit(config);
  const label = root.querySelector("[data-persona-loading-label]");
  const char = label?.firstChild;
  commit(config);
  expect(root.querySelector("[data-persona-loading-label]")).toBe(label);
  expect(label?.firstChild).toBe(char);
  commit({ ...config, loadingLabel: { animation: "pulse", duration: 4000 } });
  expect(root.querySelector(".persona-tool-loading-shimmer")).toBeNull();
  expect(root.querySelector<HTMLElement>(".persona-tool-loading-pulse")?.style.getPropertyValue("--persona-tool-anim-duration")).toBe("4000ms");
  commit({ ...config, loadingLabel: { animation: "none" } });
  expect(root.querySelector("[data-preserve-animation]")).toBeNull();
});

it("starts only on live DOM, updates stable handles, and disposes before builtin restoration", () => {
  const root = document.createElement("div"); document.body.append(root);
  let cfg = config;
  const lifecycle = createLoadingLabelLifecycle(root, () => cfg);
  const update = vi.fn();
  const destroy = vi.fn(() => { root.querySelector("[data-persona-loading-label]")?.replaceChildren(); });
  const animate = vi.fn(({ element }) => { expect(element.isConnected).toBe(true); return { update, destroy }; });
  const commit = (patch: AgentWidgetConfig) => {
    cfg = patch;
    const next = document.createElement("div"); next.append(createToolBubble(tool, cfg));
    lifecycle.prepare(next); morphMessages(root, next); lifecycle.sync();
  };
  commit({ ...config, loadingLabel: { animate } });
  const label = root.querySelector("[data-persona-loading-label]");
  expect(animate).toHaveBeenCalledTimes(1);
  commit({ ...config, loadingLabel: { animate, duration: 4500 } });
  expect(animate).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
  expect(root.querySelector("[data-persona-loading-label]")).toBe(label);
  commit({ ...config, loadingLabel: { animation: "rainbow" } });
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(root.querySelector(".persona-tool-loading-rainbow .persona-tool-char")?.textContent).toBeTruthy();
  commit({ ...config, loadingLabel: { animate } });
  expect(animate).toHaveBeenCalledTimes(2);
  lifecycle.prepare(document.createElement("div")); root.replaceChildren(); lifecycle.sync();
  expect(destroy).toHaveBeenCalledTimes(2);
  lifecycle.destroy(); expect(destroy).toHaveBeenCalledTimes(2);
});

it("cleans up on callback replacement, reduced motion changes, and widget destruction", () => {
  const motion = new EventTarget() as EventTarget & { matches: boolean };
  motion.matches = true;
  vi.stubGlobal("matchMedia", vi.fn(() => motion as MediaQueryList));
  const root = document.createElement("div"); document.body.append(root);
  const destroy = vi.fn(); const animate = vi.fn((_context: LoadingLabelAnimationContext) => ({ destroy }));
  let cfg: AgentWidgetConfig = { ...config, loadingLabel: { animate } };
  root.append(createTypingIndicator(cfg));
  const lifecycle = createLoadingLabelLifecycle(root, () => cfg);
  lifecycle.sync(); expect(animate).not.toHaveBeenCalled();
  motion.matches = false; motion.dispatchEvent(new Event("change"));
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ kind: "waiting", reducedMotion: false, text: "Thinking…" }));
  motion.matches = true; motion.dispatchEvent(new Event("change")); expect(destroy).toHaveBeenCalledTimes(1);
  motion.matches = false; motion.dispatchEvent(new Event("change")); expect(animate).toHaveBeenCalledTimes(2);
  const replacement = vi.fn(() => ({ destroy })); cfg = { ...config, loadingLabel: { animate: replacement } };
  lifecycle.sync(); expect(destroy).toHaveBeenCalledTimes(2); expect(replacement).toHaveBeenCalledTimes(1);
  lifecycle.destroy(); expect(destroy).toHaveBeenCalledTimes(3);
  motion.dispatchEvent(new Event("change")); expect(replacement).toHaveBeenCalledTimes(1);
});

it("does not start effects for none or terminal group attention states", () => {
  const animate = vi.fn();
  const cfg: AgentWidgetConfig = { ...config, loadingLabel: { animation: "none", animate } };
  const root = document.createElement("div"); root.append(createTypingIndicator(cfg));
  const lifecycle = createLoadingLabelLifecycle(root, () => cfg); lifecycle.sync();
  expect(animate).not.toHaveBeenCalled(); lifecycle.destroy();
  for (const state of [{ interrupted: true }, { success: false }, { approvalStatus: "denied" as const }, { approvalStatus: "pending" as const }]) {
    const message = { ...tool, toolCall: { ...tool.toolCall!, ...state } };
    expect(createActivityGroup(message, config, false, "Needs attention").bubble.querySelector("[data-persona-loading-label]")).toBeNull();
  }
});

it("disposes a handle returned after reentrant destroy and never restarts a disposed lifecycle", () => {
  const root = document.createElement("div"); document.body.append(root);
  const destroy = vi.fn();
  const cfg: AgentWidgetConfig = { ...config, loadingLabel: { animate: () => { lifecycle.destroy(); return { destroy }; } } };
  root.append(createTypingIndicator(cfg));
  const lifecycle = createLoadingLabelLifecycle(root, () => cfg);
  lifecycle.sync(); expect(destroy).toHaveBeenCalledTimes(1);
  lifecycle.sync(); lifecycle.destroy(); expect(destroy).toHaveBeenCalledTimes(1);
});
