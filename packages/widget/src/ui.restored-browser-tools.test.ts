// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { provideApprovalUi } from "./approval-ui-loader";
import * as approvalUiEntry from "./approval-ui-entry";
import type { AgentWidgetMessage, AgentWidgetStoredState } from "./types";

provideApprovalUi(approvalUiEntry);
let controller: ReturnType<typeof createAgentExperience> | undefined;
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });

const snapshot = (): AgentWidgetStoredState => ({
  metadata: { custom: "retained" }, draft: { text: "My unsent proposal" },
  messages: [
    { id: "tool-1", role: "assistant", content: "", createdAt: "2026-01-01", sequence: 1, streaming: true, variant: "tool", agentMetadata: { executionId: "exec", awaitingLocalTool: true }, toolCall: { id: "call-1", name: "webmcp:purchase", status: "running", startedAt: 1, args: { quantity: 2 }, approvalStatus: "pending" } },
    { id: "tool-2", role: "assistant", content: "", createdAt: "2026-01-01", sequence: 2, variant: "tool", toolCall: { id: "call-2", name: "webmcp:search", status: "complete", result: "Found two items", durationMs: 2000 } },
    { id: "approval-webmcp-1", role: "assistant", content: "", createdAt: "2026-01-01", sequence: 3, variant: "approval", approval: { id: "webmcp-1", status: "pending", agentId: "", executionId: "", toolType: "webmcp", toolName: "webmcp:purchase", description: "Buy items", parameters: { quantity: 2 } } },
  ] satisfies AgentWidgetMessage[],
});

for (const source of ["sync", "async", "initial", "hook"] as const) {
  describe.each(["card", "row"] as const)(`${source} restoration (%s)`, variant => {
    it("renders historical controls and activity as interrupted while preserving drafts", async () => {
      const stored = snapshot();
      const before = structuredClone(stored);
      const mount = document.createElement("div"); document.body.appendChild(mount);
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      controller = createAgentExperience(mount, {
        apiUrl: "/test", launcher: { enabled: false }, webmcp: { enabled: true },
        ...(source === "initial" ? { initialMessages: stored.messages, persistState: false } : source === "hook" ? { onStateLoaded: () => stored, persistState: false } : {
          storageAdapter: { load: () => source === "async" ? Promise.resolve(stored) : stored, save: vi.fn(), clear: vi.fn() },
        }),
        features: { toolCallDisplay: { variant, grouped: true, groupedMode: "collapsible" } },
        toolCall: { completeTextTemplate: "Finished {toolName} ~{duration}~" },
      });
      await vi.waitFor(() => expect(mount.textContent).toContain("chat restarted"));
      expect(mount.querySelector('[data-action="allow"], [data-action="deny"], [data-approval-buttons]')).toBeNull();
      expect(mount.querySelector('[data-tool-elapsed], [data-activity-state="running"], [data-activity-state="awaiting-approval"]')).toBeNull();
      expect(mount.querySelector('[data-message-id="tool-1"]')?.textContent).toContain("Interrupted");
      expect(mount.querySelector('[data-message-id="tool-1"]')?.textContent).not.toContain("Finished");
      if (variant === "row") {
        expect(mount.querySelector('[data-persona-tool-group]')?.getAttribute("data-activity-state")).toBe("interrupted");
        expect(mount.textContent).toContain("2s");
      }
      if (source === "sync" || source === "async") expect(controller.getComposerState().text).toBe("My unsent proposal");
      expect(stored).toEqual(before);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
}

it("keeps a cardless interrupted tool visible when completed rows are removed", async () => {
  const stored = snapshot();
  const mount = document.createElement("div"); document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    launcher: { enabled: false }, persistState: false,
    initialMessages: [stored.messages![0]],
    features: { toolCallDisplay: { variant: "row", completedVisibility: "removed" } },
    toolCall: { renderCollapsedSummary: ({ createElapsedElement }) => createElapsedElement() },
  });
  expect(mount.querySelector('[data-message-id="tool-1"]')).not.toBeNull();
  expect(mount.querySelector('[data-tool-elapsed]')).toBeNull();
  expect(mount.textContent).toContain("chat restarted");
});

it.each(["button", "controller"] as const)("restored server WebMCP approval uses its transport via %s", async route => {
  const message = snapshot().messages![2];
  message.approval!.executionId = "durable-exec";
  const onDecision = vi.fn(async () => undefined);
  const mount = document.createElement("div"); document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    launcher: { enabled: false }, persistState: false, initialMessages: [message], approval: { onDecision },
  });
  expect(onDecision).not.toHaveBeenCalled();
  if (route === "button") mount.querySelector<HTMLButtonElement>('[data-action="allow"]')!.click();
  else await controller.resolveApproval(message.approval!.id, "approved");
  await vi.waitFor(() => expect(onDecision).toHaveBeenCalledTimes(1));
  expect(onDecision.mock.calls[0]).toEqual([{
    approvalId: "webmcp-1", executionId: "durable-exec", agentId: "", toolName: "webmcp:purchase",
  }, "approved", undefined]);
});
