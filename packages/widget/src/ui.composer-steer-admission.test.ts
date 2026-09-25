// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { AgentWidgetSession } from "./session";
import { loadContextMentions } from "./context-mentions-loader";
import { createStaticMentionSource } from "./utils/mention-matcher";

let controller: ReturnType<typeof createAgentExperience> | undefined;
afterEach(() => {
  controller?.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each(["hook", "history"] as const)(
  "retains the composer when a retry fills admission during async %s preparation",
  async (pause) => {
    const init = vi
      .spyOn(AgentWidgetSession.prototype, "initClientSession")
      .mockResolvedValue(null);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hook = vi.fn(() => (pause === "hook" ? waiting : undefined));
    const mount = document.createElement("div");
    document.body.append(mount);
    controller = createAgentExperience(mount, {
      clientToken: "demo-token",
      launcher: { enabled: false },
      persistState: false,
      attachments: { enabled: true },
      contextMentions: {
        enabled: true,
        sources: [
          createStaticMentionSource({
            id: "files",
            label: "Files",
            items: [{ id: "app", label: "app" }],
            resolve: () => ({ llmAppend: "keep this context" }),
          }),
        ],
      },
      composer: {
        streamingSubmitBehavior: "steer",
        onBeforeSend: hook,
        modes: [{ id: "once", label: "One shot", persistence: "once" }],
        defaultActiveModeIds: ["once"],
      },
    });
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    const session = init.mock.contexts[0] as AgentWidgetSession;
    const dispatch = vi
      .spyOn(session.getClient(), "dispatch")
      .mockImplementation(
        async (options) =>
          new Promise<void>((resolve) => {
            options.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            });
          }),
      );
    session.hydrateMessages(
      Array.from({ length: 8 }, (_, index) => ({
        id: `retry-${index}`,
        role: "user" as const,
        content: `retry ${index}`,
        createdAt: new Date().toISOString(),
        delivery: { turnId: `retry-${index}`, status: "rejected" as const },
      })),
    );
    const retries = Array.from({ length: 7 }, (_, index) =>
      session.retrySteeredMessage(`retry-${index}`),
    );
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());

    const attachmentInput = mount.querySelector<HTMLInputElement>(
      "[data-persona-composer-attachment-input]",
    )!;
    const file = new File(["keep"], "note.txt", { type: "text/plain" });
    Object.defineProperty(attachmentInput, "files", {
      value: { 0: file, length: 1, item: () => file },
    });
    attachmentInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(controller!.getComposerState().attachments[0]?.status).toBe(
        "ready",
      ),
    );
    await loadContextMentions();
    controller.setMessage("@app");
    await vi.waitFor(() =>
      expect(
        document.querySelector("[data-persona-mention-menu]"),
      ).not.toBeNull(),
    );
    mount.querySelector("textarea")!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() =>
      expect(controller!.getComposerState().mentionRefs).toHaveLength(1),
    );
    controller.setMessage("Keep this draft");
    controller.setQuote({ text: "Keep this quote" });
    const internal = session as unknown as {
      historyGate: Promise<void> | null;
    };
    if (pause === "history") internal.historyGate = waiting;

    expect(controller.submitMessage()).toBe(true);
    expect(controller.submitMessage("Do not replace it")).toBe(false);
    expect(mount.querySelector("textarea")?.value).toBe("Keep this draft");
    retries.push(session.retrySteeredMessage("retry-7"));
    expect(session.canAcceptSteeredInput()).toBe(false);
    internal.historyGate = null;
    release();
    // Wait until the actual reservation rejects, not merely the hook resolving.
    await vi.waitFor(() =>
      expect(mount.textContent).toContain("Message was not sent"),
    );
    expect(session.getMessages()).toHaveLength(8);
    expect(controller.getComposerState()).toMatchObject({
      text: "Keep this draft",
      activeModeIds: ["once"],
      quote: { text: "Keep this quote" },
    });
    expect(controller.getComposerState().attachments).toHaveLength(1);
    expect(controller.getComposerState().mentionRefs).toHaveLength(1);

    session.clearMessages();
    await Promise.all(retries);
    dispatch.mockImplementation(async (options, onEvent) => {
      options.steer!.onAdmission({
        kind: "stream",
        executionId: "new",
        deliveryId: "new",
        status: "settled",
      });
      onEvent({ type: "status", status: "idle", terminal: true });
    });
    await vi.waitFor(() => expect(controller!.submitMessage()).toBe(true));
    await vi.waitFor(() => expect(session.getMessages()).toHaveLength(1));
    expect(session.getMessages()[0].content).toBe("Keep this draft");
    expect(
      session
        .getMessages()[0]
        .contentParts?.some((part) => part.type === "file"),
    ).toBe(true);
    expect(session.getMessages()[0].contextMentions).toHaveLength(1);
    expect(controller.getComposerState().mentionRefs).toHaveLength(0);
    expect(controller.getComposerState()).toMatchObject({
      text: "",
      attachments: [],
      activeModeIds: [],
    });
    expect(controller.getComposerState().quote).toBeUndefined();
  },
);
