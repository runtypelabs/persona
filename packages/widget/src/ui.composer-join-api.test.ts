// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { AgentWidgetSession } from "./session";

let controller: ReturnType<typeof createAgentExperience> | undefined;
afterEach(() => {
  controller?.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
describe("programmatic composer sends during live joining", () => {
  it.each([undefined, "Explicit message"])(
    "preserves the draft when join admission is full (message: %s)",
    async (message) => {
      vi.spyOn(
        AgentWidgetSession.prototype,
        "initClientSession",
      ).mockResolvedValue(null);
      vi.spyOn(AgentWidgetSession.prototype, "isStreaming").mockReturnValue(
        true,
      );
      const capacity = vi
        .spyOn(AgentWidgetSession.prototype, "canAcceptJoinedInput")
        .mockReturnValue(false);
      const send = vi
        .spyOn(AgentWidgetSession.prototype, "sendMessage")
        .mockResolvedValue();
      const mount = document.createElement("div");
      document.body.append(mount);
      controller = createAgentExperience(mount, {
        clientToken: "demo-token",
        launcher: { enabled: false },
        persistState: false,
        composer: { streamingSubmitBehavior: "join" },
      });
      expect(controller.setMessage("Keep this draft")).toBe(true);
      expect(controller.submitMessage(message)).toBe(false);
      expect(mount.querySelector("textarea")?.value).toBe("Keep this draft");
      expect(send).not.toHaveBeenCalled();

      capacity.mockReturnValue(true);
      expect(controller.submitMessage(message)).toBe(true);
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(send.mock.calls[0][0]).toBe(message ?? "Keep this draft");
      expect(mount.querySelector("textarea")?.value).toBe("");
    },
  );

  it.each(["join", "block", "interrupt", "defer-one"] as const)(
    "honors %s policy without bypassing composer locks",
    async (behavior) => {
      vi.spyOn(AgentWidgetSession.prototype, "isStreaming").mockReturnValue(
        true,
      );
      vi.spyOn(
        AgentWidgetSession.prototype,
        "canAcceptJoinedInput",
      ).mockReturnValue(true);
      const send = vi
        .spyOn(AgentWidgetSession.prototype, "sendMessage")
        .mockResolvedValue();
      const mount = document.createElement("div");
      document.body.append(mount);
      controller = createAgentExperience(mount, {
        clientToken: "demo-token",
        launcher: { enabled: false },
        persistState: false,
        composer: { streamingSubmitBehavior: behavior },
      });
      expect(controller.setMessage("Another detail")).toBe(behavior === "join");
      expect(controller.submitMessage("Another detail")).toBe(
        behavior === "join",
      );
      if (behavior === "join")
        await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      else expect(send).not.toHaveBeenCalled();
      controller.update({
        composer: { inputDisabled: true, sendDisabled: true },
      });
      expect(controller.setMessage("locked")).toBe(false);
      expect(controller.submitMessage("locked")).toBe(false);
    },
  );
});
