// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetConfig } from "./types";
import type { PersonaTransport } from "./transport";

let controller: ReturnType<typeof createAgentExperience> | undefined;

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
    conversationId: "conv-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    flow: { id: "agent-1", name: "Agent", description: null },
    config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
    durableRecovery: { enabled: true },
    visitor: { token: "cvt_test_visitor" },
    realtime: { protocol: "runtype-client-session-v1", url: "wss://example.com/v1/client/socket" },
  });

function mountWidget(config: Partial<AgentWidgetConfig> = {}) {
  const inits: string[] = [];
  const sockets: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/client/init")) {
        // A minted visitor is claimed by an immediate second request; count the first only.
        if (!String(init?.body ?? "").includes('"sessionId"')) inits.push(url);
        return initResponse();
      }
      return new Response('data: {"type":"done"}\n\n', { headers: { "Content-Type": "text/event-stream" } });
    })
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      readyState = 0;
      constructor(url: string) {
        sockets.push(url);
      }
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    }
  );
  const warms: string[] = [];
  const realWarm = AgentWidgetClient.prototype.warmTransport;
  vi.spyOn(AgentWidgetClient.prototype, "warmTransport").mockImplementation(function (this: AgentWidgetClient, reason) {
    if (warms[warms.length - 1] !== reason) warms.push(reason);
    realWarm.call(this, reason);
  });
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "https://example.com",
    clientToken: "ct_test_realtime_connect",
    agentId: "agent-1",
    launcher: { enabled: false },
    persistState: false,
    ...config,
  } as AgentWidgetConfig);
  const textarea = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  const type = (value: string) => {
    textarea.value = value;
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value.slice(-1) }));
  };
  const hoverComposer = () => textarea.dispatchEvent(new Event("pointerover", { bubbles: true }));
  return { mount, textarea, type, hoverComposer, inits, sockets, warms };
}

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};

describe("realtime.connect", () => {
  it("defaults to focus and, with realtime unset, never starts a session itself", async () => {
    const w = mountWidget();
    await settle();
    expect(w.warms).toEqual([]);
    w.hoverComposer();
    await settle();
    expect(w.warms).toEqual(["intent"]);
    expect(w.inits).toEqual([]);
    expect(w.sockets).toEqual([]);
  });

  it("with realtime set explicitly, a focus trigger starts the session and opens the socket", async () => {
    const w = mountWidget({ realtime: true });
    w.hoverComposer();
    // WHY: the first socket in this file also loads the transport chunk, which can take longer than settle() under load.
    await vi.waitFor(() =>
      expect(w.sockets).toEqual([expect.stringMatching(/^wss:\/\/example.com\/v1\/client\/socket\?/)]));
    expect(w.inits).toHaveLength(1);
  });

  it("'load' connects at mount, initializing the session once even when sessionInit also fires", async () => {
    const w = mountWidget({ realtime: { connect: "load" }, sessionInit: "mount" });
    await settle();
    expect(w.inits).toHaveLength(1);
    expect(w.sockets).toHaveLength(1);
  });

  it("'input' ignores focus and connects on the first typed character", async () => {
    const w = mountWidget({ realtime: { connect: "input" }, sessionInit: "send" });
    w.hoverComposer();
    w.textarea.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await settle();
    expect(w.warms).toEqual([]);
    expect(w.inits).toEqual([]);
    w.type("h");
    await settle();
    expect(w.warms).toEqual(["intent"]);
    expect(w.inits).toHaveLength(1);
    expect(w.sockets).toHaveLength(1);
  });

  it("'open' connects when the launcher opens the widget, not on hover", async () => {
    const w = mountWidget({ realtime: { connect: "open" }, launcher: { enabled: true, autoExpand: false } });
    w.mount.querySelector("[data-persona-launcher-surface]")?.dispatchEvent(new Event("pointerover", { bubbles: true }));
    await settle();
    expect(w.warms).toEqual([]);
    controller!.open();
    await settle();
    expect(w.warms).toEqual(["open"]);
    expect(w.sockets).toHaveLength(1);
  });

  it("an update() from 'input' to 'load' connects right away", async () => {
    const w = mountWidget({ realtime: { connect: "input" }, sessionInit: "send" });
    await settle();
    expect(w.sockets).toEqual([]);
    controller!.update({ realtime: { connect: "load" } });
    await settle();
    expect(w.sockets).toHaveLength(1);
  });

  it("an update() from a hook to 'open' on an open widget connects right away", async () => {
    const w = mountWidget({ realtime: { connect: () => undefined }, sessionInit: "send" });
    await settle();
    expect(w.sockets).toEqual([]);
    controller!.update({ realtime: { connect: "open" } });
    await settle();
    expect(w.sockets).toHaveLength(1);
  });

  it("an update() that replaces the client reconnects a 'load' widget instead of waiting for a send", async () => {
    const w = mountWidget({ realtime: { connect: "load" } });
    await settle();
    expect(w.sockets).toHaveLength(1);
    controller!.update({ realtime: { connect: "load", enabled: true } });
    await settle();
    expect(w.sockets).toHaveLength(2);
  });

  it("an update() that replaces the client reconnects an open 'focus' widget", async () => {
    const w = mountWidget({ realtime: true });
    w.hoverComposer();
    await settle();
    expect(w.sockets).toHaveLength(1);
    controller!.update({ realtime: { enabled: true } });
    await settle();
    expect(w.sockets).toHaveLength(2);
  });

  it("'open' counts an inline widget as open at mount", async () => {
    const w = mountWidget({ realtime: { connect: "open" } });
    await settle();
    expect(w.warms).toEqual(["open"]);
    expect(w.sockets).toHaveLength(1);
  });

  it("a hook gets connect and mount, is cleaned up on an update() swap and on destroy, and may throw", async () => {
    const cleanups: string[] = [];
    let connect: (() => void) | undefined;
    const first = vi.fn((ctx: { connect: () => void; mount: HTMLElement }) => {
      connect = ctx.connect;
      return () => cleanups.push("first");
    });
    const w = mountWidget({ realtime: { connect: first } });
    await settle();
    expect(first).toHaveBeenCalledWith(expect.objectContaining({ mount: w.mount }));
    w.hoverComposer();
    await settle();
    expect(w.warms).toEqual([]);
    connect!();
    await settle();
    expect(w.sockets).toHaveLength(1);
    const second = vi.fn(() => {
      throw new Error("host bug");
    });
    controller!.update({ realtime: { connect: second } });
    expect(cleanups).toEqual(["first"]);
    expect(second).toHaveBeenCalledTimes(1);
    const third = vi.fn(() => () => cleanups.push("third"));
    controller!.update({ realtime: { connect: third } });
    controller!.destroy();
    controller = undefined;
    expect(cleanups).toEqual(["first", "third"]);
  });

  it.each([
    ["realtime: false", { realtime: false, sessionInit: "send" }],
    ["enabled: false", { realtime: { enabled: false, connect: "load" as const }, sessionInit: "send" }],
  ])("%s: no trigger starts a session or opens a socket", async (_name, config) => {
    const w = mountWidget(config as Partial<AgentWidgetConfig>);
    w.hoverComposer();
    w.type("hello");
    await settle();
    expect(w.sockets).toEqual([]);
    expect(w.inits).toEqual([]);
  });

  it("with a host transport, the trigger warms it and never starts a session", async () => {
    const warm = vi.fn();
    const transport: PersonaTransport = { request: (req, next) => next(req), warm };
    const w = mountWidget({
      realtime: { connect: "load" },
      transport,
      sessionInit: "send",
      launcher: { enabled: true, autoExpand: false },
    });
    await settle();
    expect(warm.mock.calls).toEqual([["intent"]]);
    expect(w.inits).toEqual([]);
  });
});
