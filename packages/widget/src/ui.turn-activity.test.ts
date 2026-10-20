// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerIcons, renderLucideIcon } from "./utils/icons";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetTurnActivity } from "./types";

let controller: ReturnType<typeof createAgentExperience>;
let mount: HTMLElement;
let push: (type: string, data?: Record<string, unknown>) => void;
let close: () => void;
let execution = "run-one";
let sequence = 0;
const authored = new Map<string, AgentWidgetTurnActivity>();
const header = () => mount.querySelector<HTMLButtonElement>("[data-persona-turn-activity] > button")!;
const inject = (message: AgentWidgetMessage) => controller.injectTestMessage({ type: "message", message });
const message = (id: string, kind: "progress" | "final" = "progress"): AgentWidgetMessage => ({ id, role: "assistant", createdAt: "2026-01-01", content: id, turnActivity: { id: "history", kind } });
async function setup(config: AgentWidgetConfig = {}) {
  const response = new Response(new ReadableStream<Uint8Array>({ start(stream) {
    push = (type, data = {}) => stream.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify({ type, executionId: execution, seq: ++sequence, ...data })}\n\n`));
    close = () => stream.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
  controller = createAgentExperience(mount, {
    apiUrl: "/test", persistState: false, future: { v5Defaults: true },
    launcher: { enabled: false }, voiceRecognition: { enabled: false },
    turnActivity: { enabled: true, resolveMessage: message => authored.get(message.agentMetadata?.textBlockId ?? message.toolCall?.id ?? "") },
    customFetch: async () => response, ...config,
  });
  await controller.ready;
}
async function start() {
  controller.submitMessage("Investigate the issue");
  await vi.waitFor(() => expect(controller.getMessages().some(message => message.role === "user")).toBe(true));
  push("execution_start", { kind: "agent", agentId: "preview", agentName: "Preview", maxTurns: 3 });
}
async function text(id: string, content: string, kind: "progress" | "final" = "progress", elapsed = 12000) {
  authored.set(id, { id: execution, kind, startedAt: Date.now() - elapsed });
  push("text_start", { id }); push("text_delta", { id, delta: content }); push("text_complete", { id });
  await vi.waitFor(() => expect(mount.textContent).toContain(content));
}
beforeEach(() => { authored.clear(); execution = "run-one"; sequence = 0; localStorage.clear(); window.scrollTo = vi.fn(); mount = document.createElement("div"); document.body.append(mount); });
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("interleaves streamed progress and compact tools under one stable header, final answer outside", async () => {
  await setup(); await start(); await text("progress-1", "I will inspect the files.");
  const original = header(); expect(original.textContent?.replace(/\s/g, " ")).toContain("Working for 12s"); expect(original.getAttribute("aria-expanded")).toBe("true");
  const progress = mount.querySelector('[data-persona-turn-activity] [data-wrapper-id]');
  authored.set("search", { id: execution, kind: "progress" });
  push("tool_start", { toolCallId: "search", toolName: "Search", iteration: 1 });
  push("tool_complete", { toolCallId: "search", toolName: "Search", success: true, result: "Found files" });
  await text("progress-2", "The cause is clear.");
  expect(header()).toBe(original); expect(mount.querySelector('[data-persona-turn-activity] [data-wrapper-id]')).toBe(progress);
  expect(mount.querySelectorAll('[data-persona-turn-activity]')).toHaveLength(1);
  expect(mount.querySelector('[data-persona-turn-activity] [data-persona-tool-group]')).toBeNull();
  await text("answer", "The issue is fixed.", "final");
  const answer = [...mount.querySelectorAll('[data-wrapper-id]')].find(row => row.textContent?.includes("The issue is fixed."));
  expect(answer?.closest('[data-persona-turn-activity]')).toBeNull();
  push("execution_complete", { kind: "agent", success: true }); close();
  await vi.waitFor(() => expect(header().textContent).toContain("Worked"));
  await vi.waitFor(() => expect(header().getAttribute("aria-expanded")).toBe("false"));
  expect(header()).toBe(original);
});

it("keeps a manual close/open choice through streaming and completion", async () => {
  await setup(); await start(); await text("p1", "Inspecting.");
  const original = header(); original.click(); expect(original.getAttribute("aria-expanded")).toBe("false");
  await text("p2", "Checking."); expect(header()).toBe(original); expect(original.getAttribute("aria-expanded")).toBe("false");
  original.click(); original.focus();
  push("execution_complete", { kind: "agent", success: true }); close();
  await vi.waitFor(() => expect(header().textContent).toContain("Worked"));
  expect(header().getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(original);
});

it.each([
  ["instant", false], ["height", false], ["instant", true], ["height", true],
] as const)("anchors the turn header through %s collapse (reader scrolled: %s)", async (animation, readerScrolled) => {
  // Vitest's global performance and JSDOM frame timestamps can have different
  // origins. Match the browser's shared clock so the 220ms ease stays bounded.
  const requestFrame = globalThis.requestAnimationFrame;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(callback => requestFrame(() => callback(performance.now())));
  await setup({ expansion: { animation, duration: 160 } });
  const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
  Object.defineProperties(body, {
    scrollHeight: { configurable: true, get: () => 3000 },
    clientHeight: { configurable: true, get: () => 400 },
  });
  // A long user prompt strands the first progress block below the viewport.
  // Its text is inset from the disclosure header by 44px. Anchoring the text
  // would put the header 28px above the viewport (644 - 16 vs 600).
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-persona-turn-activity")) return 600;
    if (this.closest("[data-persona-turn-activity]")) return 644;
    if (this.hasAttribute("data-message-id")) return this.textContent?.includes("Investigate") ? 100 : 1200;
    return 0;
  });
  await start(); await text("p", "Investigating the issue.");
  await vi.waitFor(() => expect(body.scrollTop).toBe(584));
  if (readerScrolled) {
    body.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
    body.scrollTop = 800;
  }
  await text("answer", "The answer stays below the header.", "final");
  push("execution_complete", { kind: "agent", success: true }); close();
  await vi.waitFor(() => expect(header().getAttribute("aria-expanded")).toBe("false"));
  expect(body.scrollTop).toBe(readerScrolled ? 800 : 584);

  // Later render/resize passes must not pull a reader back to the header.
  body.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
  body.scrollTop = 800;
  controller.update({ expansion: { animation, duration: 120 } });
  expect(body.scrollTop).toBe(800);
});

it.each(["cancel", "error"] as const)("settles a %s run with correct attention and no stale working label", async outcome => {
  await setup(); await start(); await text("p", "Investigating.");
  if (outcome === "cancel") mount.querySelector<HTMLFormElement>("[data-persona-composer-form]")!.requestSubmit();
  else { push("execution_error", { error: "Mock failure" }); close(); }
  await vi.waitFor(() => expect(header().textContent).toContain(outcome === "cancel" ? "Stopped" : "Failed"));
  expect(mount.querySelector('[data-persona-turn-activity]')?.getAttribute("data-activity-state")).toBe(outcome === "cancel" ? "interrupted" : "error");
});

it("keeps untimed history collapsed without invented duration and never reactivates it", async () => {
  await setup(); inject(message("old progress")); inject(message("old final", "final"));
  expect(header().textContent).toContain("Worked"); expect(header().textContent).not.toMatch(/for|moment|0s/); expect(header().getAttribute("aria-expanded")).toBe("false");
  await start(); await text("new progress", "New investigation.");
  const headers = [...mount.querySelectorAll('[data-persona-turn-activity] > button')];
  expect(headers).toHaveLength(2); expect(headers[0].textContent).toBe("Worked"); expect(headers[1].textContent).toContain("Working");
});

it("honors explicit measured history terminal metadata and direct metadata before resolver", async () => {
  await setup({ turnActivity: { enabled: true, resolveMessage: () => ({ id: "wrong", kind: "final" }) } });
  const m = message("progress"); m.turnActivity = { id: "measured", kind: "progress", startedAt: 1000, completedAt: 1087000 };
  inject(m); expect(header().textContent).toBe("Worked for 18m 6s");
  expect(mount.querySelector('[data-persona-turn-activity]')?.getAttribute('data-persona-turn-activity')).toBe('measured');
});

it("loads progress-only activity while tools and reasoning are hidden, and leaves opt-out unchanged", async () => {
  await setup({ features: { showToolCalls: false, showReasoning: false } });
  await start(); await text("p", "Reviewing the evidence."); expect(header()).not.toBeNull();
  controller.update({ turnActivity: { enabled: false } });
  expect(mount.querySelector('[data-persona-turn-activity]')).toBeNull(); expect(mount.textContent).toContain("Reviewing the evidence.");
});

it("allows custom headers and host-authored teammate progress without creating synthetic agents", async () => {
  const renderHeader = vi.fn(context => `Review · ${context.defaultSummary}`);
  await setup({ turnActivity: { enabled: true, renderHeader } });
  inject({ ...message("teammate"), content: "Research assistant: checked 3 sources" });
  expect(header().textContent).toBe("Review · Worked"); expect(renderHeader).toHaveBeenCalledWith(expect.objectContaining({ id: "history", active: false }));
  expect(mount.textContent).toContain("Research assistant: checked 3 sources");
});

it("starts its elapsed clock after one second even through a silent gap", async () => {
  await setup(); await start();
  const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  await text("p", "Starting the inspection.", "progress", 0);
  expect(header().textContent).toBe("Working");
  expect(header().querySelector("[data-tool-elapsed]")).not.toBeNull();
  clock.mockReturnValue(now + 3100);
  await vi.waitFor(() => expect(header().textContent).toBe("Working for 3s"));
});

it("joins a run enabled midstream without activating an earlier history row", async () => {
  await setup({ turnActivity: { enabled: false, resolveMessage: message => authored.get(message.agentMetadata?.textBlockId ?? "") } });
  inject(message("old progress")); await start(); await text("p", "Current inspection.");
  controller.update({ turnActivity: { enabled: true } }); await controller.ready;
  await vi.waitFor(() => expect(mount.querySelectorAll('[data-persona-turn-activity]')).toHaveLength(2));
  const headers = [...mount.querySelectorAll('[data-persona-turn-activity] > button')];
  expect(headers[0].textContent).toBe("Worked"); expect(headers[1].textContent).toContain("Working");
});

it("clears local run timing before reusing history ids", async () => {
  await setup(); await start(); await text("p", "Inspection.");
  push("execution_complete", {kind:"agent", success:true}); close();
  await vi.waitFor(() => expect(header().textContent).toContain("Worked"));
  controller.clearChat(); inject(message("same id"));
  expect(header().textContent).toBe("Worked"); expect(header().getAttribute("aria-expanded")).toBe("false");
});

it("keeps a pending approval visible across stream pauses and settles it on cancellation", async () => {
  await setup(); await start(); await text("p", "A tool needs permission.");
  inject({ ...message("approval"), content:"", variant:"tool", turnActivity:{id:execution,kind:"progress"},
    toolCall:{id:"approval",name:"Write file",status:"pending",approvalStatus:"pending"} });
  expect(header().textContent).toBe("Waiting for approval for 12s");
  expect(header().getAttribute("aria-expanded")).toBe("true");
  mount.querySelector<HTMLFormElement>("[data-persona-composer-form]")!.requestSubmit();
  await vi.waitFor(() => expect(header().textContent).toContain("Stopped"));
});

it("retains a prior cancelled turn and duration while a new run starts", async () => {
  await setup(); await start(); await text("p", "First inspection.");
  mount.querySelector<HTMLFormElement>("[data-persona-composer-form]")!.requestSubmit();
  await vi.waitFor(() => expect(header().textContent).toContain("Stopped"));
  const previous = header().textContent;
  // connectStream starts a continuation without injecting another user message.
  execution = "run-two"; sequence = 0;
  let write!: (value: Uint8Array) => void;
  const stream = new ReadableStream<Uint8Array>({start(controller) { write = value => controller.enqueue(value); }});
  void controller.connectStream(stream);
  authored.set("second",{id:execution,kind:"progress"});
  for (const [type,data] of [["execution_start",{kind:"agent",agentId:"test",agentName:"Test"}], ["text_start",{id:"second"}], ["text_delta",{id:"second",delta:"Second inspection."}]] as const) {
    write(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify({type,executionId:execution,seq:++sequence,...data})}\n\n`));
  }
  await vi.waitFor(() => expect(mount.querySelectorAll('[data-persona-turn-activity]')).toHaveLength(2));
  const headers = [...mount.querySelectorAll('[data-persona-turn-activity] > button')];
  expect(headers[0].textContent).toBe(previous); expect(headers[1].textContent).toBe("Working");
});

it("keeps grouped-summary context global and supplies the original turn configuration", async () => {
  const summaries = vi.fn<NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderGroupedSummary"]>>(() => null);
  await setup({ features:{toolCallDisplay:{grouped:true,groupedMode:"summary"}}, toolCall:{renderGroupedSummary:summaries} });
  for (const id of ["first","last"]) inject({...message(id),content:"",variant:"tool",turnActivity:{id,kind:"progress"},toolCall:{id,name:"Read",status:"complete"}});
  const latest = summaries.mock.calls.slice(-2).map(call => call[0]);
  expect(latest.map(context => context.isLatestGroup)).toEqual([false,true]);
  expect(latest.every(context => context.config.turnActivity?.enabled)).toBe(true);
});

it("cleans terminal disclosure timers created while destroying a live run", async () => {
  const handles: ReturnType<typeof vi.fn>[] = [];
  await setup({loadingLabel:{animate:() => { const destroy = vi.fn(); handles.push(destroy); return {destroy}; }}}); await start(); await text("p", "Inspection in progress.");
  vi.useFakeTimers(); controller.destroy();
  expect(vi.getTimerCount()).toBe(0);
  expect(handles.length).toBeGreaterThan(0);
  for (const destroy of handles) expect(destroy).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

const nativeText = async (id: string, content: string, phase?: string, completePhase?: string) => {
  push("text_start", { id, phase }); push("text_delta", { id, delta: content }); push("text_complete", { id, phase: completePhase });
  await vi.waitFor(() => expect(mount.textContent).toContain(content));
};
const turnHeaders = () => [...mount.querySelectorAll<HTMLButtonElement>('[data-persona-turn-activity] > button')];
const rowForText = (content: string) => {
  const id = controller.getMessages().find(message => message.content === content)?.id;
  const row = mount.querySelector<HTMLElement>(`[data-wrapper-id="${id}"]`);
  expect(row).not.toBeNull();
  return row!;
};

it("uses native commentary and tool/reasoning events, with answer placement separate from run completion", async () => {
  await setup({ turnActivity: { enabled: true } }); await start();
  await nativeText("commentary", "I will check the implementation.", "commentary");
  const original = header();
  expect(original.textContent).toContain("Working");
  push("reasoning_start", { id: "thinking" }); push("reasoning_delta", { id: "thinking", delta: "Inspecting dependencies" }); push("reasoning_complete", { id: "thinking" });
  push("tool_start", { toolCallId: "native-search", toolName: "Search", iteration: 1 });
  push("tool_complete", { toolCallId: "native-search", toolName: "Search", success: true, result: "Found" });
  await nativeText("partial", "The first part is ready.", "partial_answer");
  await nativeText("final", "Here is the final result.", "final_answer");
  expect(turnHeaders()).toHaveLength(1);
  expect(header()).toBe(original);
  expect(header().textContent).toContain("Working");
  for (const content of ["The first part is ready.", "Here is the final result."]) expect(rowForText(content)?.closest('[data-persona-turn-activity]')).toBeNull();
  expect(controller.getMessages().find(message => message.agentMetadata?.textBlockId === "partial")?.agentMetadata?.phase).toBe("partial_answer");
  push("execution_complete", { kind: "agent", success: true }); close();
  await vi.waitFor(() => expect(header().textContent).toContain("Worked"));
});

it("preserves chronology across unclassified prose and partial answers by splitting visible progress spans", async () => {
  await setup({ turnActivity: { enabled: true } }); await start();
  await nativeText("first", "First progress.", "commentary");
  const first = header();
  await nativeText("unknown", "Unclassified prose.");
  await nativeText("second", "Second progress.", "commentary");
  await nativeText("partial", "A stable partial answer.", "partial_answer");
  push("tool_start", { toolCallId: "after-partial", toolName: "Later search" });
  await vi.waitFor(() => expect(turnHeaders()).toHaveLength(3));
  expect(turnHeaders()[0]).toBe(first);
  const text = mount.textContent!;
  expect(text.indexOf("First progress.")).toBeLessThan(text.indexOf("Unclassified prose."));
  expect(text.indexOf("Unclassified prose.")).toBeLessThan(text.indexOf("Second progress."));
  expect(text.indexOf("Second progress.")).toBeLessThan(text.indexOf("A stable partial answer."));
  expect(rowForText("A stable partial answer.").compareDocumentPosition(turnHeaders()[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(rowForText("Unclassified prose.")?.closest('[data-persona-turn-activity]')).toBeNull();
});

it("keeps missing, invalid, and late phases in the normal transcript while retaining late history metadata", async () => {
  await setup({ turnActivity: { enabled: true } }); await start();
  await nativeText("unknown", "No phase available.");
  await nativeText("invalid", "An invalid phase.", "not-a-phase");
  await nativeText("late", "The provider classified this later.", undefined, "commentary");
  expect(turnHeaders()).toHaveLength(0);
  const late = controller.getMessages().find(message => message.agentMetadata?.textBlockId === "late");
  expect(late?.agentMetadata).toMatchObject({ providerPhase: "commentary" });
  expect(late?.agentMetadata?.phase).toBeUndefined();
});

it("gives direct and resolver classifications precedence and uses native defaults for undefined resolver results", async () => {
  await setup({ turnActivity: { enabled: true, resolveMessage: message => message.id === "override" ? { id: "resolver", kind: "progress" } : undefined } });
  const native = (id: string, phase: "commentary" | "final_answer"): AgentWidgetMessage => ({ id, role: "assistant", content: id, createdAt: "2026-01-01", agentMetadata: { phase, executionId: "native-run" } });
  inject({ ...native("direct", "commentary"), turnActivity: { id: "direct", kind: "final" } });
  expect(turnHeaders()).toHaveLength(0);
  inject(native("override", "final_answer"));
  expect(turnHeaders()[0].parentElement?.dataset.personaTurnActivity).toBe("resolver");
  inject(native("fallback", "commentary"));
  expect(turnHeaders()[1].parentElement?.dataset.personaTurnActivity).toBe("native-run");
});

it("uses native tool-only activity with a stable header as compact tool groups form", async () => {
  await setup({ turnActivity: { enabled: true }, features: { toolCallDisplay: { grouped: true, groupedMode: "summary" } } }); await start();
  push("tool_start", { toolCallId: "first", toolName: "First" });
  await vi.waitFor(() => expect(turnHeaders()).toHaveLength(1));
  const original = header();
  push("tool_complete", { toolCallId: "first", toolName: "First", success: true });
  push("tool_start", { toolCallId: "second", toolName: "Second" });
  await vi.waitFor(() => expect(controller.getMessages().some(message => message.toolCall?.id === "second")).toBe(true));
  expect(header()).toBe(original); expect(turnHeaders()).toHaveLength(1);
  expect(header().textContent).toContain("Working");
});

it("separates reliable native executions and leaves missing execution identity ungrouped", async () => {
  await setup({ turnActivity: { enabled: true } });
  for (const id of ["one", "two"]) inject({ id, role: "assistant", content: id, createdAt: "2026-01-01", agentMetadata: { executionId: id, phase: "commentary" } });
  inject({ id: "unowned", role: "assistant", content: "No execution identity", createdAt: "2026-01-01", agentMetadata: { phase: "commentary" } });
  expect(turnHeaders()).toHaveLength(2);
  expect(turnHeaders().map(item => item.parentElement?.dataset.personaTurnActivity)).toEqual(["one", "two"]);
  expect(rowForText("No execution identity")?.closest('[data-persona-turn-activity]')).toBeNull();
});

it("keeps native history metadata through actual storage replay with no adapter or invented duration", async () => {
  let stored: import("./types").AgentWidgetStoredState | null = null;
  const storageAdapter: NonNullable<AgentWidgetConfig["storageAdapter"]> = {
    load: () => stored,
    save: state => { stored = JSON.parse(JSON.stringify(state)); },
    clear: () => { stored = null; },
  };
  await setup({ turnActivity: { enabled: true }, persistState: true, storageAdapter }); await start();
  await nativeText("commentary", "Stored progress.", "commentary");
  await nativeText("answer", "Stored answer.", "partial_answer", "final_answer");
  push("execution_complete", { kind: "agent", success: true }); close();
  await vi.waitFor(() => expect(stored?.messages?.some(message => message.agentMetadata?.phase === "commentary")).toBe(true));
  controller.destroy(); mount.replaceChildren();
  await setup({ turnActivity: { enabled: true }, persistState: true, storageAdapter });
  expect(turnHeaders()).toHaveLength(1);
  expect(header().textContent).toBe("Worked");
  expect(header().getAttribute("aria-expanded")).toBe("false");
  expect(controller.getMessages().find(message => message.content === "Stored answer.")?.agentMetadata).toMatchObject({ phase: "partial_answer", providerPhase: "final_answer" });
  expect(rowForText("Stored answer.")?.closest('[data-persona-turn-activity]')).toBeNull();
});

it("leaves native phases in the transcript when turn activity is disabled", async () => {
  await setup({ turnActivity: { enabled: false } }); await start();
  await nativeText("commentary", "Visible ordinary progress.", "commentary");
  expect(turnHeaders()).toHaveLength(0);
});

it("does not split native progress around hidden reasoning from another execution", async () => {
  await setup({ turnActivity: { enabled: true }, features: { showReasoning: false } });
  inject({ id: "before-hidden", role: "assistant", content: "Before hidden reasoning.", createdAt: "2026-01-01", agentMetadata: { executionId: "same-run", phase: "commentary" } });
  const original = header();
  inject({ id: "hidden", role: "assistant", content: "", createdAt: "2026-01-01", variant: "reasoning", reasoning: { id: "hidden", status: "complete", chunks: ["Hidden"] }, agentMetadata: { executionId: "other-run" } });
  inject({ id: "after-hidden", role: "assistant", content: "After hidden reasoning.", createdAt: "2026-01-01", agentMetadata: { executionId: "same-run", phase: "commentary" } });
  expect(turnHeaders()).toHaveLength(1); expect(header()).toBe(original);
});

it.each([false, true])("uses compact built-in commentary without actions, leaving final actions intact (v5=%s)", async v5Defaults => {
  await setup({ future: { v5Defaults }, messageActions: { enabled: true, showCopy: true } });
  inject({ ...message("compact-progress"), content: "Checking the implementation." });
  inject({ ...message("normal-final", "final"), content: "Here is the finished answer." });
  const progress = rowForText("Checking the implementation.");
  expect(progress.querySelector(".persona-turn-commentary")).not.toBeNull();
  expect(progress.querySelector(".persona-message-actions")).toBeNull();
  const answer = rowForText("Here is the finished answer.");
  expect(answer.closest("[data-persona-turn-activity]")).toBeNull();
  expect(answer.querySelector('[data-action="copy"]')).not.toBeNull();
});

it.each([false, true])("defaults classified tools to collapsed compact batches while leaving unknown tools alone (v5=%s)", async v5Defaults => {
  await setup({ future: { v5Defaults } });
  for (const id of ["compact-read", "compact-search"]) inject({ ...message(id), content: "", variant: "tool",
    toolCall: { id, name: id === "compact-read" ? "read_file" : "search", status: "running", chunks: ["Details only on expansion"] } });
  const group = mount.querySelector('[data-persona-turn-activity] [data-persona-tool-group]');
  expect(group?.classList.contains("persona-activity-row")).toBe(true);
  for (const id of ["compact-read", "compact-search"]) {
    const bubble = mount.querySelector(`[data-wrapper-id="${id}"] > .persona-activity-row`);
    expect(bubble).not.toBeNull();
    expect(bubble?.querySelector(":scope > button")?.getAttribute("aria-expanded")).toBe("false");
    expect(bubble?.querySelector(".persona-activity-icon")).not.toBeNull();
  }
  inject({ id: "unclassified-tool", role: "assistant", createdAt: "2026-01-01", content: "", variant: "tool",
    toolCall: { id: "unclassified-tool", name: "Unknown history", status: "complete" } });
  const outside = mount.querySelector('[data-wrapper-id="unclassified-tool"]');
  expect(outside?.closest("[data-persona-turn-activity]")).toBeNull();
  expect(outside?.querySelector(".persona-activity-row") !== null).toBe(v5Defaults);
});

it("preserves explicit card/grouping choices and compact defaults after clearing them", async () => {
  await setup({ future: { v5Defaults: false }, features: { toolCallDisplay: { variant: "card", grouped: false, groupedMode: "stack", autoExpand: true } } });
  for (const id of ["authored-one", "authored-two"]) inject({ ...message(id), content: "", variant: "tool", toolCall: { id, name: "read_file", status: "complete" } });
  expect(mount.querySelector('[data-persona-turn-activity] [data-persona-tool-group]')).toBeNull();
  expect(mount.querySelector('[data-wrapper-id="authored-one"] > .persona-activity-row')).toBeNull();
  controller.update({ features: { toolCallDisplay: { variant: undefined, grouped: undefined, groupedMode: undefined, autoExpand: undefined } } });
  expect(mount.querySelector('[data-persona-turn-activity] [data-persona-tool-group]')?.classList.contains("persona-activity-row")).toBe(true);
});

it("restores ordinary message actions on a live opt-out and reapplies compact defaults without another request", async () => {
  await setup({ future: { v5Defaults: false } });
  const request = vi.fn();
  controller.update({ getHeaders: () => { request(); return {}; } });
  await start(); await text("toggle-progress", "Live progress survives the toggle.");
  expect(request).toHaveBeenCalledTimes(1);
  expect(rowForText("Live progress survives the toggle.").querySelector('[data-action="copy"]')).toBeNull();
  controller.update({ turnActivity: { enabled: false } });
  expect(turnHeaders()).toHaveLength(0);
  expect(rowForText("Live progress survives the toggle.").querySelector('[data-action="copy"]')).not.toBeNull();
  controller.update({ turnActivity: { enabled: true } }); await controller.ready;
  expect(turnHeaders()).toHaveLength(1);
  expect(rowForText("Live progress survives the toggle.").querySelector('[data-action="copy"]')).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});

it("preserves a custom message renderer's chrome and actions inside activity", async () => {
  await setup({ layout: { messages: { renderAssistantMessage: ({ message }) => {
    const bubble = document.createElement("div");
    bubble.className = "persona-message-bubble persona-message-assistant-bubble custom-progress";
    const actions = document.createElement("button"); actions.className = "persona-message-actions";
    actions.textContent = "Custom action";
    bubble.append(message.content, actions);
    return bubble;
  } } } });
  inject(message("custom-progress"));
  const custom = mount.querySelector("[data-persona-turn-activity] .custom-progress");
  expect(custom?.querySelector(".persona-message-actions")?.textContent).toBe("Custom action");
  expect(custom?.classList.contains("persona-turn-commentary")).toBe(false);
});

it("preserves explicit commentary geometry and tool/header render hooks", async () => {
  const summary = vi.fn(() => "Authored tool label");
  const grouped = vi.fn(() => "Authored batch label");
  await setup({ future: { v5Defaults: false },
    theme: { components: { message: { assistant: { padding: "9px 11px", background: "pink", shadow: "0 0 2px red" } }, activity: { rowHeight: "38px", groupGap: "7px" } } },
    toolCall: { renderCollapsedSummary: summary, renderGroupedSummary: grouped },
  });
  inject(message("styled-progress"));
  const bubble = mount.querySelector<HTMLElement>(".persona-turn-commentary")!;
  expect(bubble.style.padding).toContain("--persona-message-assistant-padding");
  expect(bubble.style.backgroundColor).toContain("--persona-message-assistant-bg");
  expect(bubble.style.boxShadow).not.toBe("none");
  for (const id of ["hook-one", "hook-two"]) inject({ ...message(id), content: "", variant: "tool", toolCall: { id, name: "read_file", status: "complete" } });
  expect(summary).toHaveBeenCalled(); expect(grouped).toHaveBeenCalled();
  expect(mount.textContent).toContain("Authored tool label"); expect(mount.textContent).toContain("Authored batch label");
});


it.each([false, true])("separates outer turn spacing from compact nested groups (v5=%s)", async v5Defaults => {
  await setup({ future: { v5Defaults } });
  inject(message("before-batch"));
  const addTool = (id: string) => inject({ ...message(id), content: "", variant: "tool", toolCall: { id, name: "web_search", status: "complete" } });
  addTool("single-search");
  expect(mount.querySelector('[data-persona-turn-activity] [data-persona-tool-group]')).toBeNull();
  addTool("second-search");
  inject(message("after-batch"));
  const turn = mount.querySelector<HTMLElement>('[data-persona-turn-activity]')!;
  const body = turn.querySelector<HTMLElement>(":scope > .persona-turn-activity-body")!;
  expect([...body.children].map(row => (row as HTMLElement).dataset.wrapperId)).toEqual(["before-batch", "tool-group-single-search", "after-batch"]);
  for (const [token, expected] of [["transcriptGap", "16px"], ["bodyPadding", "16px 0"], ["groupIndent", "16px"], ["groupGap", "2px"], ["groupPadding", "2px 0"], ["rowHeight", "28px"]]) {
    expect(turn.style.getPropertyValue(`--persona-components-activity-${token}`)).toBe(expected);
  }
  const group = body.querySelector('[data-persona-tool-group]')!;
  expect(group.querySelector(":scope > button")?.textContent).toBe("Searched the web");
  const children = group.querySelectorAll('[data-persona-tool-group-stack] > [data-wrapper-id]');
  expect(children).toHaveLength(2);
  for (const child of children) expect(child.querySelector(":scope > .persona-activity-row > button")?.textContent).toBe("Searched the web");
  expect(mount.style.getPropertyValue("--persona-components-activity-transcriptGap")).not.toBe("16px");
});

it("preserves authored outer and nested spacing, then restores defaults when cleared", async () => {
  await setup({ theme: { components: { activity: { transcriptGap: "19px", bodyPadding: "17px 0", groupIndent: "0px", groupGap: "3px", groupPadding: "4px 0", rowHeight: "36px" } } } });
  inject(message("authored-spacing"));
  const turn = () => mount.querySelector<HTMLElement>('[data-persona-turn-activity]')!;
  for (const token of ["transcriptGap", "bodyPadding", "groupIndent", "groupGap", "groupPadding", "rowHeight"]) {
    expect(turn().style.getPropertyValue(`--persona-components-activity-${token}`)).toBe("");
  }
  controller.update({ theme: { components: { activity: { transcriptGap: undefined, bodyPadding: undefined, groupIndent: undefined, groupGap: undefined, groupPadding: undefined, rowHeight: undefined } } } });
  expect(turn().style.getPropertyValue("--persona-components-activity-transcriptGap")).toBe("16px");
  expect(turn().style.getPropertyValue("--persona-components-activity-groupGap")).toBe("2px");
  expect(turn().style.getPropertyValue("--persona-components-activity-groupIndent")).toBe("16px");
});

it.each(["plain", "inset"] as const)("retains per-kind %s group overrides below scoped turn defaults", async groupAppearance => {
  await setup({ features: { toolCallDisplay: { groupAppearance } }, theme: { components: {
    activity: { groupIndent: "20px", groupGap: "4px", groupPadding: "6px 0" },
    toolBubble: { groupIndent: "0px", groupGap: "0px", groupPadding: "0px" },
  } } });
  for (const id of ["kind-one", "kind-two"]) inject({ ...message(id), variant: "tool", toolCall: { id, name: "Read", status: "complete" } });
  const turn = mount.querySelector<HTMLElement>('[data-persona-turn-activity]')!;
  expect(turn.querySelector<HTMLElement>('[data-persona-tool-group-row]')?.dataset.groupAppearance).toBe(groupAppearance);
  for (const field of ["groupIndent", "groupGap", "groupPadding"]) {
    expect(mount.style.getPropertyValue(`--persona-components-toolBubble-${field}`)).toBe("0px");
    expect(turn.style.getPropertyValue(`--persona-components-activity-${field}`)).toBe("");
  }
  controller.update({ theme: { components: { activity: { groupIndent: undefined, groupGap: undefined, groupPadding: undefined } } } });
  expect(mount.querySelector<HTMLElement>('[data-persona-turn-activity]')!.style.getPropertyValue("--persona-components-activity-groupIndent")).toBe("16px");
  expect(mount.style.getPropertyValue("--persona-components-toolBubble-groupIndent")).toBe("0px");
});

const iconFor = (id: string) => mount.querySelector<HTMLElement>(`[data-message-id="${id}"] > button > .persona-activity-icon`);
const iconMarkup = (name: string) => renderLucideIcon(name, 16, "currentColor", 2)!.outerHTML;
const toolMessage = (id: string, name: string, extra: Partial<NonNullable<AgentWidgetMessage["toolCall"]>> = {}): AgentWidgetMessage => ({
  ...message(id), variant: "tool", toolCall: { id, name, status: "complete", ...extra },
});

it.each([false, true])("uses mapped completion icons inside and outside turn activity (V5 %s)", async v5Defaults => {
  await setup({ future: { v5Defaults }, features: { toolCallDisplay: { variant: "row", grouped: false, iconVisibility: "always" } } });
  inject(toolMessage("search", "web_search"));
  expect(iconFor("search")?.innerHTML).toBe(iconMarkup("globe"));
  expect(iconFor("search")?.style.color).toBe("inherit");
  inject({ ...toolMessage("outside", "web_search"), turnActivity: undefined });
  expect(iconFor("outside")?.innerHTML).toBe(iconMarkup("globe"));
  expect(iconFor("outside")?.style.color).toBe("inherit");
  controller.update({ turnActivity: { enabled: false } });
  expect(iconFor("search")?.innerHTML).toBe(iconMarkup("globe"));
});

it.each([false, true])("distinguishes completed reasoning and Worked headers while retaining overrides (V5 %s)", async v5Defaults => {
  await setup({ future: { v5Defaults }, features: {
    toolCallDisplay: { iconVisibility: "always", groupIconVisibility: "always" },
    reasoningDisplay: { layout: "row", iconVisibility: "always" },
  } });
  inject({ ...message("thought"), content: "", variant: "reasoning", reasoning: { id: "thought", status: "complete", chunks: ["Inspect the implementation"] } });
  const turnIcon = () => header().querySelector<HTMLElement>(":scope > .persona-activity-icon");
  expect(header().textContent).toContain("Worked");
  expect(turnIcon()?.innerHTML).toBe(iconMarkup("square-text"));
  expect(turnIcon()?.style.color).toBe("inherit");
  expect(iconFor("thought")?.innerHTML).toBe(iconMarkup("brain"));
  expect(iconFor("thought")?.style.color).toBe("inherit");
  expect(mount.querySelector("[data-persona-icon-pending]")).toBeNull();
  controller.update({ toolCall: { iconName: "check" }, features: { reasoningDisplay: { iconName: "check" } } });
  expect(turnIcon()?.innerHTML).toBe(iconMarkup("check"));
  expect(turnIcon()?.style.color).toBe("");
  expect(iconFor("thought")?.innerHTML).toBe(iconMarkup("check"));
  expect(iconFor("thought")?.style.color).toBe("");
  controller.update({ toolCall: { iconName: undefined }, features: { reasoningDisplay: { iconName: undefined } }, turnActivity: { enabled: false } });
  expect(iconFor("thought")?.innerHTML).toBe(iconMarkup("brain"));
  controller.update({ features: { reasoningDisplay: { iconVisibility: "active" } } });
  expect(iconFor("thought")).toBeNull();
});

it.each([[false, false], [false, true], [true, false], [true, true]])("resolves group icons and preserves custom summaries (V5 %s, turn %s)", async (v5Defaults, enabled) => {
  await setup({ future: { v5Defaults }, turnActivity: { enabled }, features: { toolCallDisplay: { variant: "row", grouped: true, groupedMode: "collapsible", iconVisibility: "always", groupIconVisibility: "always" } }, toolCall: { renderGroupedSummary: () => {
    const custom = document.createElement("span"); custom.dataset.customSummary = "true"; custom.textContent = "Custom batch"; return custom;
  } } });
  inject(toolMessage("one", "web_search")); inject(toolMessage("two", "WebSearch"));
  expect(iconFor("tool-group-one")?.innerHTML).toBe(iconMarkup("globe"));
  expect(mount.querySelector("[data-custom-summary]")?.textContent).toBe("Custom batch");
  inject(toolMessage("three", "Read"));
  expect(iconFor("tool-group-one")?.innerHTML).toBe(iconMarkup("toolbox"));
  controller.update({ toolCall: { iconName: "check" } });
  expect(iconFor("tool-group-one")?.innerHTML).toBe(iconMarkup("check"));
  expect(iconFor("tool-group-one")?.style.color).toBe("");
  controller.update({ toolCall: { iconName: undefined } });
  controller.update({ features: { toolCallDisplay: { groupIconVisibility: "never" } } });
  expect(iconFor("tool-group-one")).toBeNull();
  expect(iconFor("one")?.innerHTML).toBe(iconMarkup("globe"));
});

it("supports registered per-tool icons, live callback replacement, fallback and explicit checks", async () => {
  registerIcons({ "custom-query": [["path", { d: "M1 2L3 4" }]] });
  await setup({ features: { toolCallDisplay: { grouped: false } }, toolCall: { iconName: tool => tool.name === "lookup" ? "custom-query" : undefined } });
  inject(toolMessage("lookup", "lookup")); inject(toolMessage("read", "Read"));
  inject(toolMessage("unknown", "lookup_order_status"));
  expect(iconFor("unknown")?.innerHTML).toBe(iconMarkup("wrench"));
  expect(iconFor("lookup")?.innerHTML).toBe(iconMarkup("custom-query"));
  expect(iconFor("read")?.innerHTML).toBe(iconMarkup("file-text"));
  controller.update({ toolCall: { iconName: () => "pencil" } });
  expect(iconFor("lookup")?.innerHTML).toBe(iconMarkup("pencil"));
  controller.update({ toolCall: { iconName: undefined } });
  expect(iconFor("lookup")?.innerHTML).toBe(iconMarkup("wrench"));
  controller.update({ toolCall: { iconName: "check" } });
  expect(iconFor("lookup")?.innerHTML).toBe(iconMarkup("check"));
  expect(iconFor("lookup")?.style.color).toBe("");
});

it.each(["active", "never"] as const)("keeps completion icon visibility %s authoritative", async iconVisibility => {
  await setup({ features: { toolCallDisplay: { grouped: false, iconVisibility } }, toolCall: { iconName: "pencil" } });
  inject(toolMessage("one", "Read")); expect(iconFor("one")).toBeNull();
  inject(toolMessage("one", "Read", { status: "running" }));
  expect(Boolean(iconFor("one"))).toBe(iconVisibility === "active");
});

it.each([
  [{ status: "pending" }, "circle", "pending"],
  [{ status: "running" }, "loader-circle", "running"],
  [{ success: false }, "x", "error"],
  [{ interrupted: true }, "x", "interrupted"],
  [{ approvalStatus: "pending" }, "clock", "awaiting-approval"],
  [{ approvalStatus: "denied" }, "x", "denied"],
  [{ approvalStatus: "timeout" }, "x", "denied"],
] as const)("preserves status icon %s over semantic overrides", async (extra, glyph, state) => {
  const resolver = vi.fn(() => "pencil");
  await setup({ features: { toolCallDisplay: { grouped: false } }, toolCall: { iconName: resolver } });
  inject(toolMessage("one", "Read", extra));
  expect(iconFor("one")?.dataset.activityIcon).toBe(state);
  expect(iconFor("one")?.innerHTML).toBe(iconMarkup(glyph));
  expect(resolver).not.toHaveBeenCalled();
});

it("supports explicit icons on ordinary rows and neutral fallback for unregistered icons", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await setup({ turnActivity: { enabled: false }, features: { toolCallDisplay: { variant: "row", grouped: false, iconVisibility: "always" } }, toolCall: { iconName: "file-text" } });
  inject(toolMessage("one", "lookup"));
  expect(iconFor("one")?.innerHTML).toBe(iconMarkup("file-text"));
  controller.update({ toolCall: { iconName: "missing-tool-icon" } });
  expect(iconFor("one")?.innerHTML).toBe(iconMarkup("square-text"));
  expect(warn).toHaveBeenCalled();
});

it("passes only original tools to group overrides and preserves attention in the group", async () => {
  const resolver = vi.fn((_tool: NonNullable<AgentWidgetMessage["toolCall"]>) => "pencil");
  await setup({ toolCall: { iconName: resolver } });
  inject(toolMessage("one", "Read")); inject(toolMessage("two", "Read"));
  expect(iconFor("tool-group-one")?.innerHTML).toBe(iconMarkup("pencil"));
  expect(resolver.mock.calls.every(([tool]) => tool.id === "one" || tool.id === "two")).toBe(true);
  resolver.mockClear();
  inject(toolMessage("one", "Read", { success: false }));
  expect(mount.querySelector("[data-persona-tool-group] > button > .persona-activity-icon")?.innerHTML).toBe(iconMarkup("x"));
  expect(resolver.mock.calls.every(([tool]) => tool.id === "two")).toBe(true);
});

it("projects the sole running action into a stable batch header and restores aggregate labels", async () => {
  await setup();
  const tool = (id: string, name: string, status: "running" | "complete", actionTitle?: string): AgentWidgetMessage => ({
    ...message(id), variant: "tool", content: "", toolCall: { id, name, status, actionTitle },
    turnActivity: { id: "history", kind: "progress" },
  });
  inject(tool("read", "Read", "complete"));
  inject(tool("search", "web_search", "running", "Checking the streaming documentation"));
  const batch = () => mount.querySelector<HTMLButtonElement>("[data-persona-tool-group] > button")!;
  const original = batch();
  expect(original.textContent?.replace(/\s/g, " ")).toContain("Checking the streaming documentation");
  original.click(); expect(original.getAttribute("aria-expanded")).toBe("true");
  controller.update({ features: { toolCallDisplay: { groupSummary: "aggregate" } } });
  expect(batch()).toBe(original);
  expect(original.textContent?.replace(/\s/g, " ")).toContain("Read files, searching the web");
  expect(original.getAttribute("aria-expanded")).toBe("true");
  controller.update({ features: { toolCallDisplay: { groupSummary: "current-action" } } });
  expect(original.textContent?.replace(/\s/g, " ")).toContain("Checking the streaming documentation");
  inject(tool("parallel", "Bash", "running", "Testing the example"));
  expect(original.textContent?.replace(/\s/g, " ")).toContain("Read files, searching the web, running commands");
  expect(original.textContent?.replace(/\s/g, " ")).not.toContain("Testing the example");
  inject(tool("search", "web_search", "complete"));
  expect(original.textContent?.replace(/\s/g, " ")).toContain("Testing the example");
  inject(tool("parallel", "Bash", "complete"));
  expect(original.textContent?.replace(/\s/g, " ")).toContain("Read files, searched the web, ran commands");
  expect(batch()).toBe(original);
});

it("keeps attention and custom summaries authoritative and leaves ordinary tools alone", async () => {
  await setup();
  const tools: AgentWidgetMessage[] = ["one", "two"].map((id, index) => ({
    ...message(id), variant: "tool", content: "", toolCall: { id, name: "web_search", status: index ? "running" : "complete", actionTitle: "Checking citations" },
    turnActivity: { id: "history", kind: "progress" },
  }));
  tools.forEach(inject);
  const batch = () => mount.querySelector<HTMLButtonElement>("[data-persona-tool-group] > button")!;
  expect(batch().textContent?.replace(/\s/g, " ")).toContain("Checking citations");
  tools[1].toolCall!.approvalStatus = "pending"; inject(tools[1]);
  expect(batch().textContent?.replace(/\s/g, " ")).toContain("Waiting for approval");
  expect(batch().textContent?.replace(/\s/g, " ")).not.toContain("Checking citations");
  tools[1].toolCall!.approvalStatus = "approved"; tools[0].toolCall!.success = false;
  inject(tools[0]); inject(tools[1]);
  expect(batch().textContent?.replace(/\s/g, " ")).toContain("Failed");
  controller.update({ toolCall: { renderGroupedSummary: () => "Host summary" } });
  expect(batch().textContent?.replace(/\s/g, " ")).toContain("Host summary");
  controller.update({ toolCall: { renderGroupedSummary: undefined } });
  tools[0].toolCall!.success = true; inject(tools[0]);
  tools[1].toolCall!.actionTitle = "   "; inject(tools[1]);
  expect(batch().textContent?.replace(/\s/g, " ")).toContain("Searching the web");
  controller.update({ turnActivity: { enabled: false } });
  expect(batch().textContent?.replace(/\s/g, " ")).toContain("Searching the web");
});

it("updates a standalone title without tool output and honors authored row summaries", async () => {
  await setup();
  const item: AgentWidgetMessage = {
    ...message("single"), content: "", variant: "tool", toolCall: { id: "single", name: "Read", status: "running", actionTitle: "Reading the first source" },
    turnActivity: { id: "history", kind: "progress" },
  };
  const row = () => mount.querySelector<HTMLButtonElement>('[data-message-id="single"] > button')!;
  inject(item);
  expect(row().textContent?.replace(/\s/g, " ")).toContain("Reading the first source");
  const original = row();
  item.toolCall!.actionTitle = "Reading the second source"; inject(item);
  expect(row()).toBe(original);
  expect(row().textContent?.replace(/\s/g, " ")).toContain("Reading the second source");
  const custom = vi.fn(context => `Host: ${context.defaultSummary}`);
  controller.update({ toolCall: { renderCollapsedSummary: custom } });
  expect(row().textContent?.replace(/\s/g, " ")).toContain("Host: Reading the second source");
  controller.update({ toolCall: { renderCollapsedSummary: undefined, activeTextTemplate: "Custom active {toolName}" } });
  expect(row().textContent?.replace(/\s/g, " ")).toContain("Custom active Read");
  controller.update({ toolCall: { activeTextTemplate: undefined }, features: { toolCallDisplay: { collapsedMode: "tool-name" } } });
  expect(row().textContent?.replace(/\s/g, " ")).toBe("Read");
  controller.update({ features: { toolCallDisplay: { collapsedMode: "tool-preview" } } });
  item.toolCall!.chunks = ["Host output preview"]; inject(item);
  expect(row().textContent?.replace(/\s/g, " ")).toBe("Host output preview");
});

it.each(["unclassified", "final"] as const)("leaves %s tool groups aggregate while turn activity is enabled", async kind => {
  await setup();
  for (const id of ["ordinary-one", "ordinary-two"]) inject({
    ...message(id), variant: "tool", content: "", toolCall: { id, name: "Read", status: id === "ordinary-one" ? "complete" : "running" },
    turnActivity: kind === "final" ? { id: "history", kind: "final" } : undefined,
  });
  const group = mount.querySelector('[data-persona-tool-group] > button')!;
  expect(group.textContent?.replace(/\s/g, " ")).toContain("Reading files");
  expect(group.closest('[data-persona-turn-activity]')).toBeNull();
});

it("passes current-action defaults to grouped hooks and keeps message-level approval attention", async () => {
  const custom = vi.fn((_context: { defaultSummary: string }) => null);
  await setup({ toolCall: { renderGroupedSummary: custom } });
  const first: AgentWidgetMessage = {
    ...message("first"), variant: "tool", content: "", toolCall: { id: "first", name: "Read", status: "complete" },
  };
  const second: AgentWidgetMessage = {
    ...message("second"), variant: "tool", content: "", toolCall: { id: "second", name: "Read", status: "running", actionTitle: "Checking the source" },
    turnActivity: { id: "history", kind: "progress" },
  };
  inject(first); inject(second);
  const group = () => mount.querySelector('[data-persona-tool-group] > button')!;
  expect(custom.mock.lastCall?.[0]).toMatchObject({ defaultSummary: "Checking the source" });
  expect(group().textContent?.replace(/\s/g, " ")).toContain("Checking the source");
  second.approval = { id: "approval", status: "pending", agentId: "agent", executionId: "history", toolName: "Read", description: "Allow reading?" };
  inject(second);
  expect(group().textContent?.replace(/\s/g, " ")).toContain("Waiting for approval");
  expect(custom.mock.lastCall?.[0]).toMatchObject({ defaultSummary: "Read · Waiting for approval" });
});

it.each(['collapsible', 'summary', 'stack'] as const)('resolves scoped %s defaults, explicit summary resets and adapter updates', async groupedMode => {
  await setup({ features: { toolCallDisplay: { grouped: true, groupedMode } } });
  inject({ ...message('one'), variant: 'tool', content: '', toolCall: { id:'one', name:'Read', status:'complete' } });
  inject({ ...message('two'), variant: 'tool', content: '', toolCall: { id:'two', name:'web_search', status:'running' } });
  const summary = () => mount.querySelector('[data-persona-tool-group] > button, .persona-tool-group-summary')!.textContent?.replace(/\s/g, ' ');
  const aggregate = 'Read files, searching the web';
  expect(summary()).toContain(groupedMode === 'stack' ? aggregate : 'Searching the web');
  controller.update({ toolCall: { resolveActionTitle: () => 'Checking citations' } });
  expect(summary()).toContain(groupedMode === 'stack' ? aggregate : 'Checking citations');
  controller.update({ features: { toolCallDisplay: { groupSummary: 'current-action' } } });
  expect(summary()).toContain('Checking citations');
  controller.update({ toolCall: { resolveActionTitle: () => 'Checking documentation' } });
  expect(summary()).toContain('Checking documentation');
  controller.update({ features: { toolCallDisplay: { groupSummary: undefined } } });
  expect(summary()).toContain(groupedMode === 'stack' ? aggregate : 'Checking documentation');
  controller.update({ turnActivity: { enabled: false } });
  expect(summary()).toContain(aggregate);
  controller.update({ features: { toolCallDisplay: { groupSummary: 'current-action' } } });
  expect(summary()).toContain('Checking documentation');
});


it.each((['collapsible', 'summary', 'stack'] as const).flatMap(groupedMode =>
  [true, false].map(enabled => ({ groupedMode, enabled }))
))('updates $groupedMode category caps live (turn activity: $enabled)', async ({ groupedMode, enabled }) => {
  await setup({ turnActivity: { enabled }, features: { toolCallDisplay: { grouped: true, groupedMode, groupSummary: 'aggregate' } } });
  for (const [index, name] of ['Read', 'read_text_file', 'Bash', 'Edit', 'web_search'].entries()) {
    inject({ ...message(String(index)), variant: 'tool', content: '', toolCall: { id: String(index), name, status: 'complete' } });
  }
  const summary = () => mount.querySelector('[data-persona-tool-group] > button, .persona-tool-group-summary')!.textContent?.replace(/\s/g, ' ');
  for (const [limit, expected] of [[0, '5 activities'], [1, 'Read files, and 3 more'], [2, 'Read files, ran commands, and 2 more'], [3, 'Read files, ran commands, edited files, and 1 more'], [5, 'Read files, ran commands, edited files, searched the web']] as const) {
    controller.update({ features: { toolCallDisplay: { groupSummaryMaxItems: limit } } });
    expect(summary()).toContain(expected);
  }
  controller.update({ features: { toolCallDisplay: { groupSummaryMaxItems: undefined } } });
  expect(summary()).toContain('Read files, ran commands, edited files, and 1 more');
});
