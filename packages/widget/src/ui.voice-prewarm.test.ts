// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type {
  AgentWidgetConfig,
  AgentWidgetVoicePrewarmHook,
  AgentWidgetVoiceRecognitionConfig,
} from "./types";

let controller: ReturnType<typeof createAgentExperience> | undefined;

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const initResponse = () =>
  Response.json({
    sessionId: "session-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    flow: { id: "agent-1", name: "Agent", description: null },
    config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
  });

const runtypeVoice = (
  extra: Partial<AgentWidgetVoiceRecognitionConfig> = {}
): AgentWidgetVoiceRecognitionConfig => ({
  enabled: true,
  provider: { type: "runtype", runtype: { agentId: "agent-1" } },
  ...extra,
});

function mountWidget(config: Partial<AgentWidgetConfig>) {
  const prewarms: Array<{ url: string; init?: RequestInit }> = [];
  const inits: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/voice/prewarm")) {
        prewarms.push({ url, init });
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/v1/client/init")) {
        inits.push(url);
        return initResponse();
      }
      return new Response('data: {"type":"done"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      });
    })
  );
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com",
    agentId: "agent-1",
    launcher: { enabled: false },
    persistState: false,
    ...config,
  } as AgentWidgetConfig);
  const mic = () => mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!;
  const hover = () => mic().dispatchEvent(new Event("pointerover", { bubbles: true }));
  return { mount, mic, hover, prewarms, inits };
}

// Lets the lazy voice runtime install and any fire-and-forget fetch run.
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

describe("voiceRecognition.prewarm: default", () => {
  it("prewarms once on mic hover in client token mode (latched)", async () => {
    const w = mountWidget({ clientToken: "ct_test", voiceRecognition: runtypeVoice() });
    await settle();
    expect(w.prewarms).toHaveLength(0);

    w.hover();
    await vi.waitFor(() => expect(w.prewarms).toHaveLength(1));
    expect(w.prewarms[0].url).toBe(
      "https://api.example.com/v1/client/agents/agent-1/voice/prewarm"
    );
    expect(w.prewarms[0].init?.headers).toEqual({ Authorization: "Bearer ct_test" });

    w.hover();
    w.mic().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    w.mic().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    expect(w.prewarms).toHaveLength(1);
  });

  it("also prewarms on keyboard focus", async () => {
    const w = mountWidget({ clientToken: "ct_test", voiceRecognition: runtypeVoice() });
    await settle();
    w.mic().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await vi.waitFor(() => expect(w.prewarms).toHaveLength(1));
  });

  it("ignores hover elsewhere in the widget", async () => {
    const w = mountWidget({ clientToken: "ct_test", voiceRecognition: runtypeVoice() });
    await settle();
    w.mount
      .querySelector("[data-persona-composer-input]")!
      .dispatchEvent(new Event("pointerover", { bubbles: true }));
    await settle();
    expect(w.prewarms).toHaveLength(0);
  });

  it("does not auto-prewarm outside client token mode", async () => {
    const w = mountWidget({
      voiceRecognition: {
        enabled: true,
        provider: { type: "runtype", runtype: { agentId: "agent-1", clientToken: "ct_voice" } },
      },
    });
    await settle();
    w.hover();
    await settle();
    expect(w.prewarms).toHaveLength(0);
  });

  it("warms the client session on the browser (Web Speech) path", async () => {
    vi.stubGlobal("SpeechRecognition", vi.fn());
    const w = mountWidget({ clientToken: "ct_test", voiceRecognition: { enabled: true } });
    await settle();
    expect(w.inits).toHaveLength(0);
    w.hover();
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
    expect(w.prewarms).toHaveLength(0);
  });
});

describe("voiceRecognition.prewarm: explicit settings", () => {
  it("false opts out", async () => {
    const w = mountWidget({
      clientToken: "ct_test",
      voiceRecognition: runtypeVoice({ prewarm: false }),
    });
    await settle();
    w.hover();
    await settle();
    expect(w.prewarms).toHaveLength(0);
  });

  it("'hover' enables it outside client token mode", async () => {
    const w = mountWidget({
      voiceRecognition: {
        enabled: true,
        prewarm: "hover",
        provider: { type: "runtype", runtype: { agentId: "agent-1", clientToken: "ct_voice" } },
      },
    });
    await settle();
    w.hover();
    await vi.waitFor(() => expect(w.prewarms).toHaveLength(1));
    expect(w.prewarms[0].init?.headers).toEqual({ Authorization: "Bearer ct_voice" });
  });

  it("a custom hook receives warm and the mic button, replaces hover, and is cleaned up", async () => {
    const cleanup = vi.fn();
    let context: Parameters<AgentWidgetVoicePrewarmHook>[0] | undefined;
    const hook = vi.fn((ctx: Parameters<AgentWidgetVoicePrewarmHook>[0]) => {
      context = ctx;
      return cleanup;
    });
    const w = mountWidget({
      clientToken: "ct_test",
      voiceRecognition: runtypeVoice({ prewarm: hook }),
    });
    await settle();
    expect(hook).toHaveBeenCalledOnce();
    expect(context?.micButton).toBe(w.mic());
    expect(context?.mount).toBe(w.mount);

    w.hover();
    await settle();
    expect(w.prewarms).toHaveLength(0);

    context!.warm();
    await vi.waitFor(() => expect(w.prewarms).toHaveLength(1));

    controller!.destroy();
    controller = undefined;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("update() swaps the hook and turning prewarm off releases it", async () => {
    const cleanupA = vi.fn();
    const hookA = vi.fn(() => cleanupA);
    const hookB = vi.fn();
    mountWidget({ clientToken: "ct_test", voiceRecognition: runtypeVoice({ prewarm: hookA }) });
    await settle();

    controller!.update({ voiceRecognition: runtypeVoice({ prewarm: hookB }) });
    expect(cleanupA).toHaveBeenCalledOnce();
    expect(hookB).toHaveBeenCalledOnce();

    controller!.update({ voiceRecognition: runtypeVoice({ prewarm: false }) });
    expect(hookB).toHaveBeenCalledOnce();
    expect(hookA).toHaveBeenCalledOnce();
  });

  it("a throwing hook does not break mount", async () => {
    const w = mountWidget({
      clientToken: "ct_test",
      voiceRecognition: runtypeVoice({
        prewarm: () => {
          throw new Error("host bug");
        },
      }),
    });
    await settle();
    expect(w.mic()).toBeTruthy();
  });
});
