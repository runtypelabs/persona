// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig } from "./types";

let controller: ReturnType<typeof createAgentExperience> | undefined;

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Reply = () => Response | Promise<Response>;

const initResponse = () =>
  Response.json({
    sessionId: "session-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    flow: { id: "agent-1", name: "Agent", description: null },
    config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
  });

function mountWidget(config: Partial<AgentWidgetConfig> = {}, initReplies: Reply[] = []) {
  const inits: string[] = [];
  const chats: string[] = [];
  const other: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/v1/client/init")) {
        const reply = initReplies[inits.length];
        inits.push(url);
        return reply ? reply() : initResponse();
      }
      if (url.endsWith("/v1/client/chat")) chats.push(url);
      else other.push(url);
      return new Response('data: {"type":"done"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
      });
    })
  );
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "https://example.com",
    clientToken: "ct_test_session_init",
    agentId: "agent-1",
    launcher: { enabled: false },
    persistState: false,
    ...config,
  } as AgentWidgetConfig);
  const textarea = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  const form = mount.querySelector<HTMLFormElement>("[data-persona-composer-form]")!;
  const type = (value: string) => {
    textarea.value = value;
    textarea.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value.slice(-1) })
    );
  };
  const submit = () =>
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return { mount, textarea, form, type, submit, inits, chats, other };
}

// Lets any fire-and-forget init reach fetch before asserting it did not.
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

describe("sessionInit: 'input' (default)", () => {
  it("does not init on mount or on focus, and inits on the first keystroke", async () => {
    const w = mountWidget({ autoFocusInput: true });
    await settle();
    w.textarea.focus();
    w.textarea.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await settle();
    expect(w.inits).toHaveLength(0);

    w.type("h");
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
    w.type("he");
    w.type("hel");
    await settle();
    expect(w.inits).toHaveLength(1);
  });

  it("ignores whitespace-only input and programmatic value changes", async () => {
    const w = mountWidget();
    w.type("   ");
    // Widget-internal edits (draft restore, setMessage, history recall)
    // dispatch a plain Event with no inputType.
    w.textarea.value = "restored draft";
    w.textarea.dispatchEvent(new Event("input", { bubbles: true }));
    controller!.setMessage("from the host");
    await settle();
    expect(w.inits).toHaveLength(0);
  });

  it("a send right after the first keystroke issues exactly one init", async () => {
    const w = mountWidget();
    w.type("hi");
    w.submit();
    await vi.waitFor(() => expect(w.chats).toHaveLength(1));
    expect(w.inits).toHaveLength(1);
  });

  it("a send while the early init is in flight reuses it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const w = mountWidget({}, [
      async () => {
        await gate;
        return initResponse();
      },
    ]);
    w.type("hi");
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
    w.submit();
    await settle();
    expect(w.chats).toHaveLength(0);
    release();
    await vi.waitFor(() => expect(w.chats).toHaveLength(1));
    expect(w.inits).toHaveLength(1);
  });

  it("swallows an early-init failure and the send retries init", async () => {
    const onSessionExpired = vi.fn();
    const w = mountWidget({ onSessionExpired }, [
      () => Response.json({ error: "boom" }, { status: 500 }),
    ]);
    w.type("h");
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
    await settle();
    w.type("hi");
    await settle();
    expect(w.inits).toHaveLength(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(w.mount.querySelector('[data-message-id^="error"]')).toBeNull();

    w.submit();
    await vi.waitFor(() => expect(w.chats).toHaveLength(1));
    expect(w.inits).toHaveLength(2);
  });
});

describe("sessionInit: 'focus'", () => {
  it("does not init on autofocus or programmatic focus", async () => {
    const w = mountWidget({ sessionInit: "focus", autoFocusInput: true });
    await settle();
    w.textarea.focus();
    await settle();
    expect(w.inits).toHaveLength(0);
  });

  it("inits on a pointer focus of the composer", async () => {
    const w = mountWidget({ sessionInit: "focus" });
    w.textarea.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
  });

  it("inits when the visitor tabs into the composer", async () => {
    const w = mountWidget({ sessionInit: "focus" });
    w.textarea.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", bubbles: true }));
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
  });
});

describe("sessionInit: 'send'", () => {
  it("inits only on send", async () => {
    const w = mountWidget({ sessionInit: "send" });
    w.textarea.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    w.type("hi");
    await settle();
    expect(w.inits).toHaveLength(0);
    w.submit();
    await vi.waitFor(() => expect(w.chats).toHaveLength(1));
    expect(w.inits).toHaveLength(1);
  });
});

describe("sessionInit: 'mount'", () => {
  it("inits on mount, as before this option existed", async () => {
    const w = mountWidget({ sessionInit: "mount" });
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
  });
});

describe("custom sessionInit hooks", () => {
  it("a function trigger inits when the host calls warm (e.g. on hover)", async () => {
    const cleanup = vi.fn();
    const hook = vi.fn(({ warm, mount }: { warm: () => void; mount: HTMLElement }) => {
      mount.addEventListener("pointerenter", warm);
      return cleanup;
    });
    const w = mountWidget({ sessionInit: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    w.type("hi");
    await settle();
    expect(w.inits).toHaveLength(0);

    w.mount.dispatchEvent(new Event("pointerenter"));
    w.mount.dispatchEvent(new Event("pointerenter"));
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
    await settle();
    expect(w.inits).toHaveLength(1);

    controller!.destroy();
    controller = undefined;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("controller.warmSession() inits imperatively", async () => {
    const w = mountWidget({ sessionInit: "send" });
    controller!.warmSession();
    controller!.warmSession();
    await vi.waitFor(() => expect(w.inits).toHaveLength(1));
    await settle();
    expect(w.inits).toHaveLength(1);
  });
});

describe("non-client-token mode", () => {
  it("proxy mode ignores sessionInit and never calls /v1/client/init", async () => {
    const hook = vi.fn();
    const w = mountWidget({
      clientToken: undefined,
      apiUrl: "https://example.com/api/chat/dispatch",
      sessionInit: "mount",
    });
    w.textarea.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    w.type("hi");
    controller!.warmSession();
    await settle();
    expect(w.inits).toHaveLength(0);
    expect(w.other).toHaveLength(0);
    controller!.update({ sessionInit: hook });
    expect(hook).not.toHaveBeenCalled();
  });
});
