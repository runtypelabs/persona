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
    let beginHistory: (() => void) | undefined;
    let historyReady: Promise<void> | undefined;
    const hook = vi.fn(() => (pause === "hook" ? waiting : beginHistory?.()));
    const mount = document.createElement("div");
    document.body.append(mount);
    controller = createAgentExperience(mount, {
      clientToken: "demo-token",
      sessionInit: "mount",
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
    if (pause === "history") {
      // Start a real boot transition during preparation, after submission eligibility
      // was checked. The session must wait without consuming the composer draft.
      beginHistory = () => {
        init.mockImplementationOnce(() => waiting.then(() => null));
        historyReady = session.initializeBootConversation();
      };
    }

    expect(controller.submitMessage()).toBe(true);
    expect(controller.submitMessage("Do not replace it")).toBe(false);
    expect(mount.querySelector("textarea")?.value).toBe("Keep this draft");
    retries.push(session.retrySteeredMessage("retry-7"));
    expect(session.canAcceptSteeredInput()).toBe(false);
    release();
    await historyReady;
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

it.each(["hook", "history"] as const)("locks the captured draft while awaiting %s admission", async (pause) => {
  const init = vi.spyOn(AgentWidgetSession.prototype, "initClientSession").mockResolvedValue(null);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let historyReady: Promise<void> | undefined;
  let session: AgentWidgetSession;
  const mount = document.createElement("div");
  document.body.append(mount);
  controller = createAgentExperience(mount, {
    clientToken: "demo-token", sessionInit: "mount", launcher: { enabled: false },
    persistState: false, attachments: { enabled: true },
    composer: { streamingSubmitBehavior: "steer", onBeforeSend: () => {
      if (pause === "hook") return waiting;
      init.mockImplementationOnce(() => waiting.then(() => null));
      historyReady = session.initializeBootConversation();
    } },
  });
  await vi.waitFor(() => expect(init).toHaveBeenCalled());
  session = init.mock.contexts[0] as AgentWidgetSession;
  const dispatch = vi.spyOn(session.getClient(), "dispatch").mockImplementation(async (options, onEvent) => {
    options.steer!.onAdmission({ kind: "stream", executionId: "run", deliveryId: "delivery", status: "settled" });
    onEvent({ type: "status", status: "idle", terminal: true });
  });
  controller.setMessage("captured draft");
  expect(controller.submitMessage()).toBe(true);
  expect(mount.querySelector("textarea")!.disabled).toBe(true);
  expect(mount.querySelector<HTMLInputElement>("[data-persona-composer-attachment-input]")!.disabled).toBe(true);
  expect(controller.setMessage("newer unsent draft")).toBe(false);
  release();
  await historyReady;
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(mount.querySelector("textarea")!.disabled).toBe(false));
  expect(dispatch.mock.calls[0][0].messages[0].content).toBe("captured draft");
});

it("keeps Stop operable while a later send waits on preparation", async () => {
  const init = vi.spyOn(AgentWidgetSession.prototype, "initClientSession").mockResolvedValue(null);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let hold = false;
  const mount = document.createElement("div");
  document.body.append(mount);
  controller = createAgentExperience(mount, {
    clientToken: "demo-token", sessionInit: "mount", launcher: { enabled: false }, persistState: false,
    composer: { streamingSubmitBehavior: "steer", onBeforeSend: () => hold ? waiting : undefined },
  });
  await vi.waitFor(() => expect(init).toHaveBeenCalled());
  const session = init.mock.contexts[0] as AgentWidgetSession;
  const dispatch = vi.spyOn(session.getClient(), "dispatch").mockImplementation(async (options) => {
    options.steer!.onAdmission({ kind: "stream", executionId: "active-run", deliveryId: "delivery", status: "settled" });
    await new Promise<void>(resolve => options.signal!.addEventListener("abort", () => resolve(), { once: true }));
  });
  const cancel = vi.spyOn(session.getClient(), "cancelClientExecution").mockResolvedValue();
  controller.submitMessage("First request");
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(mount.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(false));
  hold = true;
  controller.setMessage("Later request");
  expect(controller.submitMessage()).toBe(true);
  const stop = mount.querySelector<HTMLButtonElement>("[data-persona-steer-stop]")!;
  expect(stop).not.toBeNull();
  expect(mount.querySelector<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
  // jsdom does not implement inert hit testing: inspect every ancestor too.
  for (let node: HTMLElement | null = stop; node; node = node.parentElement) {
    expect(node.inert, node.tagName).not.toBe(true);
  }
  stop.click();
  expect(cancel).toHaveBeenCalledWith("active-run");
  release();
});
