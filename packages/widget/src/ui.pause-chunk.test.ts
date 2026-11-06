// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { setApprovalUiLoader } from "./approval-ui-loader";
import * as approvalUi from "./approval-ui-entry";

it("loads a pause renderer even when tools and reasoning are hidden", async () => {
  window.scrollTo = vi.fn();
  let resolve!: (module: typeof approvalUi) => void;
  const load = vi.fn(() => new Promise<typeof approvalUi>((ready) => { resolve = ready; }));
  setApprovalUiLoader(load);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://example.invalid/chat", launcher: { enabled: false }, persistState: false,
    features: { showToolCalls: false, showReasoning: false },
  });
  try {
    await controller.ready;
    controller.injectTestMessage({ type: "message", message: {
      id: "pause", role: "assistant", content: "", createdAt: "2026-11-05", variant: "pause", streaming: true,
      durablePause: { awaitReason: "crawl_pending", resolved: false },
    } });
    expect(load).toHaveBeenCalledOnce();
    resolve(approvalUi);
    await new Promise((done) => setTimeout(done, 0));
    expect(mount.querySelector('[data-message-id="pause"][role="status"]')).not.toBeNull();
  } finally {
    controller.destroy(); mount.remove(); vi.restoreAllMocks();
  }
});
