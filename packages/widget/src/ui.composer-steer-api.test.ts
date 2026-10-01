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
describe("programmatic composer sends during live steering", () => {
  it.each([undefined, "Explicit message"])(
    "preserves the draft when steer admission is full (message: %s)",
    async (message) => {
      vi.spyOn(
        AgentWidgetSession.prototype,
        "initClientSession",
      ).mockResolvedValue(null);
      vi.spyOn(AgentWidgetSession.prototype, "isStreaming").mockReturnValue(
        true,
      );
      const capacity = vi
        .spyOn(AgentWidgetSession.prototype, "canAcceptSteeredInput")
        .mockReturnValue(false);
      const send = vi
        .spyOn(AgentWidgetSession.prototype, "sendMessage")
        .mockImplementation(async (_text, options) => {
          options?.onAccepted?.();
        });
      const mount = document.createElement("div");
      document.body.append(mount);
      controller = createAgentExperience(mount, {
        clientToken: "demo-token",
        launcher: { enabled: false },
        persistState: false,
        composer: { streamingSubmitBehavior: "steer" },
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

  it.each(["steer", "block", "interrupt", "defer-one"] as const)(
    "honors %s policy without bypassing composer locks",
    async (behavior) => {
      vi.spyOn(AgentWidgetSession.prototype, "isStreaming").mockReturnValue(
        true,
      );
      vi.spyOn(
        AgentWidgetSession.prototype,
        "canAcceptSteeredInput",
      ).mockReturnValue(true);
      const send = vi
        .spyOn(AgentWidgetSession.prototype, "sendMessage")
        .mockImplementation(async (_text, options) => {
          options?.onAccepted?.();
        });
      const mount = document.createElement("div");
      document.body.append(mount);
      controller = createAgentExperience(mount, {
        clientToken: "demo-token",
        launcher: { enabled: false },
        persistState: false,
        composer: { streamingSubmitBehavior: behavior },
      });
      expect(controller.setMessage("Another detail")).toBe(behavior === "steer");
      expect(controller.submitMessage("Another detail")).toBe(
        behavior === "steer",
      );
      if (behavior === "steer")
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
