// @vitest-environment jsdom

/**
 * Transport test for the lazy approval-ui chunk: what the transcript does
 * while the chunk is in flight, after it lands, and when it fails to load.
 *
 * Lives in its own file because the chunk loader's memoization is
 * module-global: once a load resolves here, later widgets in this file see it
 * synchronously, and other test files (which run isolated) are unaffected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { setApprovalUiLoader, type ApprovalUiModule } from "./approval-ui-loader";
import * as approvalUiEntry from "./approval-ui-entry";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const injectApproval = (
  controller: ReturnType<typeof createAgentExperience>,
  id = "appr-1"
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id: `approval-${id}`,
      role: "assistant",
      content: "",
      createdAt: "2026-04-24T00:00:00.000Z",
      streaming: false,
      variant: "approval",
      approval: {
        id,
        status: "pending",
        agentId: "agent_1",
        executionId: "exec_1",
        toolName: "Search documentation",
        description: "Search the docs",
        parameters: { query: "approval theming" },
      },
    },
  });
};

const flushChunkLoad = async () => {
  // Loader promise → adopt → re-render is a few microtask hops; a macrotask
  // hop covers them all without coupling to the exact chain length.
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("approval-ui chunk transport", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the transcript alive when the chunk load fails, then heals on retry", async () => {
    setApprovalUiLoader(() => Promise.reject(new Error("network")));
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectApproval(controller, "fail-1");
    await flushChunkLoad();

    // The approval row is held as an empty wrapper; nothing crashed and the
    // rest of the transcript still renders.
    const wrapper = mount.querySelector("#wrapper-approval-fail-1");
    expect(wrapper).not.toBeNull();
    expect(mount.querySelector(".persona-approval-bubble")).toBeNull();

    // Point the loader at the real module; the next render retries the load
    // and hydrates the card.
    setApprovalUiLoader(() =>
      Promise.resolve(approvalUiEntry as unknown as ApprovalUiModule)
    );
    injectApproval(controller, "fail-2");
    await flushChunkLoad();

    expect(
      mount.querySelectorAll(".persona-approval-bubble, .persona-approval-card").length
    ).toBeGreaterThan(0);
    controller.destroy();
  });

  it("renders approvals synchronously once the module is cached", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectApproval(controller, "warm-1");
    // No flush: the previous test resolved the loader, so the module is
    // memoized and the card renders in the same tick.
    expect(
      mount.querySelectorAll(".persona-approval-bubble, .persona-approval-card").length
    ).toBeGreaterThan(0);
    controller.destroy();
  });
});
