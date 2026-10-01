import "@runtypelabs/persona/widget.css";
import "./v5-preview.css";
import { initAgentWidget, type AgentWidgetConfig, type AgentWidgetMessage, type AgentWidgetPlugin } from "@runtypelabs/persona";
import { renderExamplesShell } from "./examples-nav";
import { createDemoEchoFetch } from "./demo-echo-fetch";
// Reuse the documented application-level hook; this is not a library default.
import { renderToolActivitySummary } from "../../../examples/ai-sdk-next/app/lib/tool-activity-summary";

renderExamplesShell();
const host = document.querySelector<HTMLElement>("#v5-host")!;
const select = (name: string) => document.querySelector<HTMLSelectElement>(`#v5-${name}`)!;
const status = document.querySelector<HTMLElement>("#v5-status")!;
const streamButton = document.querySelector<HTMLButtonElement>("#v5-stream")!;
let widget: ReturnType<typeof initAgentWidget>;
let timers: ReturnType<typeof setTimeout>[] = [];
let epoch = Date.now();
let serial = 0;
const order = new Map<string, number>();

// Application-owned renderer: each invocation owns its listeners until Persona
// aborts the render signal. Approval and execution are deliberately separate.
const approvalPlugin: AgentWidgetPlugin = {
  id: "preview-approval",
  renderApproval: ({ message, execution, signal, approve, deny }) => {
    const approval = message.approval;
    if (!approval) return null;
    const root = document.createElement("section");
    root.className = "v5-custom-approval";
    const title = document.createElement("strong");
    title.textContent = approval.toolName;
    const state = document.createElement("p");
    state.textContent = approval.status === "pending" ? "Permission requested · local sample"
      : approval.status === "denied" ? "Denied · did not run"
      : approval.status === "timeout" ? "Expired · execution unknown"
      : `Approved · ${execution?.status ?? "execution unknown"}`;
    state.setAttribute("role", "status");
    root.append(title, state);
    if (approval.status === "pending") {
      let decided = false;
      const buttons: HTMLButtonElement[] = [];
      const cleanup: (() => void)[] = [];
      for (const [label, action] of [["Allow once", approve], ["Deny", deny]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        const click = () => {
          if (decided || signal?.aborted) return;
          decided = true;
          buttons.forEach((item) => { item.disabled = true; });
          action();
        };
        button.addEventListener("click", click);
        cleanup.push(() => button.removeEventListener("click", click));
        buttons.push(button);
        root.append(button);
      }
      const dispose = () => {
        cleanup.forEach((remove) => remove());
        buttons.forEach((button) => { button.disabled = true; });
      };
      if (signal?.aborted) dispose();
      else signal?.addEventListener("abort", dispose, { once: true });
    }
    return root;
  },
};
function approvalSample(id: string, state: "pending" | "approved" | "denied", linked = true) {
  inject({ id: `approval-${id}`, variant: "approval", approval: {
    id, status: state, agentId: "preview-agent", executionId: "preview-approval",
    toolName: "Search sample documentation", description: "Search the in-browser sample documentation.",
    reason: "I want to find the theme configuration examples.", parameters: { query: "Persona themes" },
    ...(linked ? { toolCallId: `approval-tool-${id}` } : {}),
  } });
}
function approvalScene() {
  inject({ id: "user", role: "user", content: "Show me how permission and execution appear in the conversation." });
  inject({ id: "approval-intro", content: "These are local samples. Approval is permission to try an action; its execution has a separate outcome." });
  for (const outcome of ["running", "completed", "failed", "denied", "unknown"] as const) {
    inject({ id: `label-${outcome}`, content: `**${outcome[0].toUpperCase() + outcome.slice(1)} sample**` });
    approvalSample(outcome, outcome === "denied" ? "denied" : "approved", outcome !== "unknown");
    if (outcome === "running" || outcome === "completed" || outcome === "failed") {
      tool(`approval-tool-${outcome}`, "Search sample documentation", {
        status: outcome === "running" ? "running" : "complete", success: outcome !== "failed",
        ...(outcome === "running" ? { durationMs: undefined, chunks: ["Searching sample pages…"] }
          : outcome === "failed" ? { error: "The sample search failed." } : { result: "Found three sample pages." }),
      });
    }
  }
  inject({ id: "approval-try", content: "**Try it yourself** · Allow once starts a simulated search. Deny leaves it unexecuted. Reset the scene to try again." });
  approvalSample("interactive", "pending");
  status.textContent = "Try Allow once or Deny below. Scroll up for running, completed, failed, denied, and unknown samples. Nothing leaves your browser.";
}
function cancelStream() {
  timers.forEach(clearTimeout);
  timers = [];
  streamButton.disabled = false;
}
function configuration(): AgentWidgetConfig {
  const v5 = select("version").value === "v5";
  const embedded = select("scene").value === "embedded";
  const detail = select("details").value;
  const variant = select("variant").value as "default" | "row" | "card";
  const activityStyle = variant === "default" ? {} : { variant };
  const grouping = select("group").value;
  const resolvedDisplay = select("approval-display").value as "default" | "row" | "status-line" | "trace";
  const icons = select("icons").value as "default" | "always" | "active" | "never";
  const display: NonNullable<NonNullable<AgentWidgetConfig["features"]>["toolCallDisplay"]> = {
    ...activityStyle,
    ...(grouping === "separate" ? { grouped: false } : {}),
    ...(grouping === "descriptive" ? { grouped: true, groupedMode: "collapsible" } : {}),
    ...(detail === "auto" ? { variant: "row", autoExpand: true } : {}),
    ...(detail === "summary" ? { expandable: false, activePreview: false, grouped: false } : {}),
    ...(icons === "default" ? {} : { iconVisibility: icons }),
  };
  return {
    apiUrl: "/v5-local-demo",
    customFetch: createDemoEchoFetch({ reply: () => "This is a local preview reply. Try opening tool details, switching themes, or comparing V4 and V5. No message is sent to a model." }),
    future: { v5Defaults: v5 },
    ...(select("scene").value.startsWith("approval") ? {
      approval: {
        approveLabel: "Allow once",
        ...(resolvedDisplay === "default" ? {} : { resolvedDisplay }),
        onDecision: async (data, decision) => {
          if (decision === "approved") {
            const id = `approval-tool-${data.approvalId}`;
            tool(id, data.toolName, { status: "running", durationMs: undefined, chunks: ["Searching sample pages…"] });
            timers.push(setTimeout(() => {
              tool(id, data.toolName, { result: "Found three sample pages." });
              status.textContent = "Local search completed. Reset the scene to try another decision.";
            }, 1800));
          } else status.textContent = "Permission denied. The sample search did not run.";
          // An explicit local response keeps the demo independent of any API.
          return new Response(null, { status: 204 });
        },
      },
      ...(select("scene").value === "approval-custom" ? { plugins: [approvalPlugin] } : {}),
    } : {}),
    colorScheme: select("theme").value as "light" | "dark",
    persistState: false,
    launcher: { enabled: false, ...(embedded ? {} : { fullHeight: true }) },
    layout: {
      ...(embedded ? { embedded: true } : {}),
      ...(select("fade").value === "default" ? {} : { topFade: select("fade").value === "on" }),
    },
    ...(embedded ? {
      composer: { placement: "block" },
      theme: { components: {
        input: { background: "var(--demo-composer-surface)" },
        composer: { footerPadding: "12px 20px" },
        markdown: { codeBlock: { background: "var(--demo-code-surface)", textColor: "var(--demo-code-text)" } },
        activity: { bodySurface: "transparent" },
      } },
    } : {}),
    ...(select("scene").value === "welcome" ? {
      welcome: { title: "What would you like to explore?" },
      suggestions: { ...(select("suggestion-edges").value === "default" ? {} : { followUps: { placement: "composer" as const, edgeStyle: select("suggestion-edges").value as "clip" | "fade" } }), starters: { behavior: "fill", items: ["Explore the new defaults", "Help me get started", "Plan a project"] } },
    } : { welcome: { variant: "none" }, suggestions: { ...(select("suggestion-edges").value === "default" ? {} : { followUps: { placement: "composer" as const, edgeStyle: select("suggestion-edges").value as "clip" | "fade" } }), starters: { items: [] } } }),
    features: {
      showToolCalls: true, showReasoning: true,
      toolCallDisplay: display,
      reasoningDisplay: { ...activityStyle, ...(icons === "default" ? {} : { iconVisibility: icons }) },
    },
    ...(grouping === "descriptive" ? { toolCall: { renderGroupedSummary: renderToolActivitySummary } } : {}),
  };
}
function reset() {
  cancelStream();
  widget?.destroy();
  host.replaceChildren();
  epoch = Date.now(); serial = 0; order.clear();
  const frame = host.parentElement!;
  frame.classList.toggle("v5-embedded-frame", select("scene").value === "embedded");
  frame.dataset.scheme = select("theme").value;
  const config = configuration();
  widget = initAgentWidget({ target: host, config });
  const { customFetch: _fetch, ...shown } = config;
  document.querySelector("#v5-config")!.textContent = JSON.stringify(shown, (_key, value) => typeof value === "function" ? `${_key} (local example hook)` : value, 2);
  document.querySelector<HTMLElement>("#v5-hook-note")!.hidden = select("group").value !== "descriptive";
  document.querySelector<HTMLElement>("#v5-approval-hook-note")!.hidden = select("scene").value !== "approval-custom";
  streamButton.textContent = select("scene").value.startsWith("approval") ? "Replay approvals" : "Run stream";
  document.querySelector("#v5-caption")!.textContent = `${select("version").value.toUpperCase()} ${select("theme").value} · ${select("scene").selectedOptions[0].textContent}`;
}
function inject(message: Partial<AgentWidgetMessage> & Pick<AgentWidgetMessage, "id">) {
  if (!order.has(message.id)) order.set(message.id, serial++);
  const sequence = order.get(message.id)!;
  widget.injectTestMessage({ type: "message", message: {
    role: "assistant", content: "", createdAt: new Date(epoch - 60000 + sequence * 100).toISOString(), sequence, ...message,
  } });
}
function tool(id: string, name: string, extra: Partial<NonNullable<AgentWidgetMessage["toolCall"]>> = {}) {
  inject({ id, variant: "tool", streaming: extra.status === "running", toolCall: { id, name, status: "complete", success: true, startedAt: epoch, durationMs: 1200, ...extra } });
}
function reasoning(running = false) {
  inject({ id: "reason", variant: "reasoning", streaming: running, reasoning: {
    id: "reason", status: running ? "streaming" : "complete", startedAt: epoch, durationMs: 6500,
    chunks: ["Checking the documentation.\nComparing the available options."],
  } });
}
function openDetails() {
  // Use the real disclosure controls so scroll behavior is exercised too.
  host.querySelector<HTMLButtonElement>('[data-persona-tool-group] > button[aria-expanded="false"]')?.click();
  host.querySelector<HTMLButtonElement>('[data-message-id="search"] > button[aria-expanded="false"]')?.click();
}
function showFollowUps() {
  tool("follow-ups", "suggest_replies", { args: { suggestions: [
    "Explain the theme options in more detail",
    "Show a complete configuration example",
    "How does this work on mobile?",
    "Compare the V4 and V5 defaults",
    "Help me customize the colors",
    "Show more integration examples",
  ] } });
}
function loadScene() {
  reset();
  const scene = select("scene").value;
  if (scene.startsWith("approval")) { approvalScene(); return; }
  if (scene === "streaming") {
    inject({ id: "user", role: "user", content: "Show me the new streaming defaults." });
    inject({ id: "final", content: "The response is ready. Try the follow-up row below, then run the stream to see the waiting indicator. Typing a new question clears these suggestions." });
    showFollowUps();
    status.textContent = "Run the stream to compare V5’s label with V4’s dots. This full-height preview uses the fullscreen suggestion limit.";
    return;
  }
  if (scene === "welcome") {
    status.textContent = "Try a suggestion or type a message. Replies are simulated locally.";
    return;
  }
  if (scene !== "long") inject({ id: "user", role: "user", content: "Check the theme documentation and show me what you find." });
  if (scene === "long" || scene === "embedded") {
    for (let i = 0; i < 8; i++) {
      inject({ id: `user-${i}`, role: "user", content: i ? "What should I consider next?" : "Help me plan a project." });
      inject({ id: `answer-${i}`, content: "Keep each step small and reviewable. Start with a clear goal, explore the options, and verify the result.\n\nScroll back to compare earlier steps. The composer remains available while you read." });
    }
  }
  if (scene === "embedded") {
    inject({ id: "embedded-code", content: "The host owns the background. Code keeps its own surface.\n\n```js\nlayout: { embedded: true }\n```" });
  }
  if (scene === "activity" || scene === "long" || scene === "embedded") reasoning();
  tool("search", "search_docs", { args: { query: "Persona theme configuration" }, result: "Found the theme guide and three examples covering colors, typography, and tool activity." });
  tool("read", "read_file", { args: { path: "docs/theme-guide.md" }, result: scene === "details" ? Array.from({ length: 18 }, (_, i) => `Section ${i + 1}: Explicit theme overrides are preserved. Compare both light and dark styles.`).join("\n") : "Read the relevant configuration examples." });
  if (scene === "details") {
    tool("command", "run_command", { args: { command: "pnpm typecheck" }, result: { success: true, errors: 0 } });
    tool("empty", "check_service_status", { result: "All services are operational. This tool has no request arguments." });
    openDetails();
  } else if (scene === "states") {
    tool("running", "run_command", { status: "running", chunks: ["Checking the project…"], durationMs: undefined });
    tool("failed", "check_service_status", { success: false, error: "The service did not respond. Try again later." });
  } else {
    inject({ id: "final", content: "The theme guide and examples are ready. You can override the activity tokens to match your application." });
  }
  status.textContent = scene === "states" ? "Sample running and failed states. Expand a call to inspect its output." : scene === "details" ? "The first tool is open. The service-status tool demonstrates a response without a request." : "Open a group, then a tool. Manual expansion preserves your reading position.";
}
function runStream() {
  if (select("scene").value.startsWith("approval")) { loadScene(); return; }
  if (select("scene").value === "streaming") {
    reset();
    streamButton.disabled = true;
    status.textContent = "Waiting for the first text, then streaming a local response…";
    inject({ id: "user", role: "user", content: "Show me the new streaming defaults." });
    inject({ id: "loading-answer", content: "", streaming: true });
    timers.push(setTimeout(() => inject({ id: "loading-answer", content: "Here is a locally simulated response", streaming: true }), 2400));
    timers.push(setTimeout(() => {
      inject({ id: "loading-answer", content: "Here is a locally simulated response. You can explore the suggested next questions, or type your own.", streaming: false });
      showFollowUps();
      streamButton.disabled = false;
      status.textContent = "Complete. Follow-ups are available again. Type to dismiss them, or compare V4.";
    }, 4200));
    return;
  }
  reset();
  streamButton.disabled = true;
  status.textContent = "Streaming sample activity. Open details manually, or try auto-expand.";
  inject({ id: "user", role: "user", content: "Find the theme guide and read the configuration options." });
  reasoning(true);
  const later = (ms: number, action: () => void) => timers.push(setTimeout(action, ms));
  later(900, () => { reasoning(); tool("search", "search_docs", { status: "running", args: { query: "Persona themes" }, durationMs: undefined }); });
  later(1600, () => tool("search", "search_docs", { status: "running", args: { query: "Persona themes" }, chunks: ["Searching the documentation…"], durationMs: undefined }));
  later(2600, () => tool("search", "search_docs", { args: { query: "Persona themes" }, chunks: ["Searching the documentation…"], result: "Found the theme guide." }));
  later(2900, () => tool("read", "read_file", { status: "running", args: { path: "docs/theme-guide.md" }, chunks: ["Reading the guide…"], durationMs: undefined }));
  later(4100, () => { tool("read", "read_file", { args: { path: "docs/theme-guide.md" }, result: "The guide describes palette, typography, and layout tokens." }); inject({ id: "final", content: "The documentation is ready. Expand either tool to inspect the Request and Response." }); streamButton.disabled = false; status.textContent = "Stream complete. Reset the scene or change a setting to compare."; });
}
for (const control of document.querySelectorAll<HTMLSelectElement>(".v5-controls select")) control.addEventListener("change", loadScene);
streamButton.addEventListener("click", runStream);
document.querySelector("#v5-reset")!.addEventListener("click", loadScene);
window.addEventListener("pagehide", () => { cancelStream(); widget.destroy(); });
loadScene();
