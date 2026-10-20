// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import { buildAssistantTurnFrames } from "./testing/mock-stream";
import type { AgentWidgetConfig, VoiceProvider, VoiceResult, VoiceStatus } from "./types";

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

function openStream() {
  const encoder = new TextEncoder();
  let push!: (text: string) => void;
  let close!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = text => controller.enqueue(encoder.encode(text));
      close = () => controller.close();
    },
  });
  return { push, close, response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }) };
}

function voiceProvider() {
  let receive: (result: VoiceResult) => void = () => {};
  let status: (value: VoiceStatus) => void = () => {};
  const provider: VoiceProvider = {
    type: "custom",
    connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    startListening: vi.fn(async () => { status("listening"); }),
    stopListening: vi.fn(async () => { status("processing"); }),
    onResult: callback => { receive = callback; },
    onStatusChange: callback => { status = callback; },
    onError: () => {},
  };
  return { provider, result: (text: string, isFinal = true) => receive({ text, isFinal, provider: "custom" }) };
}

function setup(config: AgentWidgetConfig = {}) {
  const provider = createDemoHistoryProvider({ conversations: [
    { id: "a", title: "Project brief", messages: [{ id: "a-seed", role: "assistant", content: "The project brief" }] },
    { id: "b", title: "Release notes", messages: [{ id: "b-seed", role: "assistant", content: "The release notes" }] },
  ] });
  const stream = openStream();
  const fetch = vi.fn(async () => stream.response);
  const mount = document.createElement("div"); document.body.append(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "/local-chat", customFetch: fetch, persistState: false,
    launcher: { enabled: false }, welcome: { variant: "none" },
    features: { history: { enabled: true, provider } },
    ...config,
  });
  controllers.push(controller);
  return { controller, provider, mount, stream, fetch };
}

function type(mount: HTMLElement, text: string) {
  const input = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function enter(mount: HTMLElement, text: string) {
  type(mount, text);
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => (element as HTMLElement).style);
});
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.destroy());
  document.body.replaceChildren(); document.head.replaceChildren(); localStorage.clear(); vi.restoreAllMocks();
});

describe("conversation switches with asynchronous work", () => {
  it("rejects a busy switch without fetching or canceling, then explicitly stops and switches", async () => {
    const { controller, provider, fetch, mount } = setup();
    await controller.openConversation("a");
    const getPage = vi.spyOn(provider, "getPage");
    const finished = vi.fn(); controller.on("run:finished", finished);
    controller.submitMessage("Send from project brief");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    type(mount, "An unsent follow-up for A");
    const before = controller.getMessages().map(message => ({ id: message.id, content: message.content }));

    await expect(controller.openConversation("b")).rejects.toMatchObject({ code: "conversation_busy" });
    expect(getPage).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
    expect(controller.getActiveConversationId()).toBe("a");
    expect(controller.getComposerState().text).toBe("An unsent follow-up for A");
    expect(controller.getMessages().map(message => ({ id: message.id, content: message.content }))).toEqual(before);
    expect(mount.querySelector(".persona-conversation-loading")).toBeNull();

    await controller.openConversation("b", { busy: "stop" });
    expect(controller.getActiveConversationId()).toBe("b");
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0][0].outcome).toBe("cancel");
    expect(controller.getComposerState().text).toBe("");
    expect(controller.getMessages().map(message => message.id)).toEqual(["b-seed"]);
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("An unsent follow-up for A");
  });

  it("aborts pending onBeforeSend on stop-and-switch and ignores its late patch", async () => {
    let release!: (value: { text: string }) => void;
    let hookSignal!: AbortSignal;
    const hook = vi.fn<NonNullable<NonNullable<AgentWidgetConfig["composer"]>["onBeforeSend"]>>((_snapshot, context) => {
      hookSignal = context.signal;
      return new Promise<{ text: string }>(resolve => { release = resolve; });
    });
    const { controller, fetch, mount } = setup({ composer: { onBeforeSend: hook } });
    await controller.openConversation("a");
    enter(mount, "Origin draft waiting for review");
    await vi.waitFor(() => expect(controller.getComposerState().phase).toBe("preparing"));
    await expect(controller.openConversation("b")).rejects.toMatchObject({ code: "conversation_busy" });
    expect(hookSignal.aborted).toBe(false);
    expect(controller.getActiveConversationId()).toBe("a");

    await controller.openConversation("b", { busy: "stop" });
    expect(hookSignal.aborted).toBe(true);
    controller.setMessage("Destination draft");
    release({ text: "Late origin patch must never be sent" });
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(controller.getComposerState().text).toBe("Destination draft");
    expect(controller.getComposerState().phase).toBe("idle");
    expect(controller.getMessages().map(message => message.id)).toEqual(["b-seed"]);
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("Origin draft waiting for review");
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it.each(["recording", "processing"] as const)("cancels %s dictation on activation and keeps late transcripts out of the destination", async phase => {
    const voice = voiceProvider();
    const { controller, mount, fetch } = setup({
      voiceRecognition: {
        enabled: true, completionBehavior: "review",
        dictation: { display: "transcript", provider: { type: "custom", custom: () => voice.provider } },
      },
    });
    await controller.openConversation("a");
    controller.setMessage("A's reviewed draft");
    expect(controller.startDictation()).toBe(true);
    await vi.waitFor(() => expect(controller.getDictationState().phase).toBe("recording"));
    voice.result("unfinished origin transcription", false);
    if (phase === "processing") {
      expect(controller.finishDictation()).toBe(true);
      await vi.waitFor(() => expect(controller.getDictationState().phase).toBe("processing"));
    }

    await controller.openConversation("b");
    expect(controller.getDictationState().phase).toBe("idle");
    expect(mount.querySelector("[data-persona-dictation]")).toBeNull();
    controller.setMessage("B's independent draft");
    voice.result("late final transcript from A");
    await flush();
    expect(controller.getComposerState().text).toBe("B's independent draft");
    expect(controller.getMessages().map(message => message.id)).toEqual(["b-seed"]);
    expect(fetch).not.toHaveBeenCalled();
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("A's reviewed draft");
  });

  it("leaves dictation active after a failed fetch and allows the final review in its origin", async () => {
    const voice = voiceProvider();
    const { controller, provider } = setup({
      voiceRecognition: {
        enabled: true, completionBehavior: "review",
        dictation: { display: "transcript", provider: { type: "custom", custom: () => voice.provider } },
      },
    });
    await controller.openConversation("a");
    controller.setMessage("Origin reviewed words");
    controller.startDictation();
    await vi.waitFor(() => expect(controller.getDictationState().phase).toBe("recording"));
    provider.failNext("getPage", { code: "unavailable" });
    await expect(controller.openConversation("b")).rejects.toMatchObject({ code: "unavailable" });
    expect(controller.getActiveConversationId()).toBe("a");
    expect(controller.getDictationState().phase).toBe("recording");
    voice.result("final origin words");
    expect(controller.getComposerState().text).toBe("Origin reviewed words final origin words");
    await controller.openConversation("b");
    await controller.openConversation("a");
    expect(controller.getComposerState().text).toBe("Origin reviewed words final origin words");
  });

  it("retains a deferred submission only in its origin after stop-and-switch", async () => {
    const { controller, mount, stream, fetch } = setup({ composer: { streamingSubmitBehavior: "defer-one" } });
    await controller.openConversation("a");
    controller.submitMessage("Origin's current turn");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    enter(mount, "Origin's queued follow-up");
    await vi.waitFor(() => expect(controller.getComposerState().pendingSubmission?.text).toBe("Origin's queued follow-up"));
    type(mount, "Origin's later unsent draft");

    await controller.openConversation("b", { busy: "stop" });
    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
    controller.setMessage("Destination stays independent");
    stream.push([
      { type: "execution_start", executionId: "old-exec", kind: "agent" },
      ...buildAssistantTurnFrames({ executionId: "old-exec", text: "Late origin answer" }),
      { type: "execution_complete", executionId: "old-exec", kind: "agent", success: true },
    ].map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""));
    stream.close();
    await flush();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(controller.getComposerState().text).toBe("Destination stays independent");
    expect(controller.getMessages().map(message => message.id)).toEqual(["b-seed"]);

    await controller.openConversation("a");
    expect(controller.getComposerState().pendingSubmission?.text).toBe("Origin's queued follow-up");
    expect(controller.getComposerState().text).toBe("Origin's later unsent draft");
    expect(fetch).toHaveBeenCalledTimes(1);
    mount.querySelector<HTMLButtonElement>("[data-persona-composer-pending-edit]")!.click();
    expect(controller.getComposerState().text).toBe("Origin's queued follow-up");
    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
  });
});
