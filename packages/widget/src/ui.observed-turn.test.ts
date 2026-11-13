// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { AgentWidgetClient, type ClientRealtimeHandlers } from "./client";
import { provideApprovalUi } from "./approval-ui-loader";
import * as approvalUiEntry from "./approval-ui-entry";
import type { AgentWidgetStoredState } from "./types";

provideApprovalUi(approvalUiEntry);
let controller: ReturnType<typeof createAgentExperience> | undefined;
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });

const frame = (id: number, data: Record<string, unknown>) =>
  `id: ${id}\nevent: ${String(data.type)}\ndata: ${JSON.stringify(data)}\n\n`;

it("shows another tab's question and approval read-only, never stores that, and settles once the turn moves on", async () => {
  let handlers: ClientRealtimeHandlers = {};
  vi.spyOn(AgentWidgetClient.prototype, "setRealtimeHandlers").mockImplementation((next) => {
    handlers = next;
  });
  const save = vi.fn();
  const mount = document.createElement("div"); document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "/test", launcher: { enabled: false },
    storageAdapter: { load: () => null, save, clear: vi.fn() },
  });
  await vi.waitFor(() => expect(handlers.onForeignExecution).toBeTypeOf("function"));

  const pausedLeg = [
    frame(1, { type: "approval_start", approvalId: "appr-1", executionId: "exec_b", toolName: "send_email", description: "Send" }),
    frame(2, { type: "await", executionId: "exec_b", toolName: "ask_user_question", origin: "local", toolCallId: "ask-1",
      parameters: { questions: [{ question: "Which plan?", options: [{ label: "Basic" }, { label: "Pro" }] }] } }),
  ].join("");
  expect(handlers.onForeignExecution?.("exec_b", () => new Response(pausedLeg))).toBe(true);

  const sheet = () => mount.querySelector("[data-persona-ask-sheet-for]");
  await vi.waitFor(() => expect(sheet()?.hasAttribute("inert")).toBe(true));
  const approval = () => mount.querySelector('[data-bubble-type="approval"]');
  await vi.waitFor(() => expect(approval()?.textContent).toContain("Waiting for approval"));
  expect(approval()!.querySelector("[data-action='allow'], [data-action='deny'], [data-action='always']")).toBeNull();

  await vi.waitFor(() => expect(save).toHaveBeenCalled());
  for (const [state] of save.mock.calls as Array<[AgentWidgetStoredState]>) {
    expect(JSON.stringify(state.messages ?? [])).not.toContain('"observed"');
  }

  // A socket reconnect replays the paused execution from its start: the question is still open.
  expect(handlers.onForeignExecution?.("exec_b", () => new Response(pausedLeg))).toBe(true);
  await new Promise((r) => setTimeout(r, 50));
  expect(sheet()?.hasAttribute("inert")).toBe(true);
  for (const [state] of save.mock.calls as Array<[AgentWidgetStoredState]>) {
    expect(JSON.stringify(state.messages ?? [])).not.toContain('"askUserQuestionAnswered":true');
  }

  // The owning tab answered: the next leg of the turn arrives, and the question leaves this tab too.
  expect(handlers.onForeignExecution?.("exec_b", () => new Response(
    frame(3, { type: "text_delta", id: "t_after", delta: "Pro it is.", executionId: "exec_b" })
  ))).toBe(true);
  await vi.waitFor(() => expect(sheet()).toBeNull());
});
