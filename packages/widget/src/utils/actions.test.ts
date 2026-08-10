// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  defaultJsonActionParser,
  defaultActionHandlers,
  createActionManager,
  createMessageAndClickActionHandler,
} from "./actions";
import type { AgentWidgetMessage } from "../types";

const makeMessage = (overrides: Partial<AgentWidgetMessage> = {}): AgentWidgetMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("message_and_click security", () => {
  it("does not click by default and only clicks inside an explicit allowlist", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <section id="safe"><button id="allowed">Allowed</button></section>
      <button id="dangerous">Dangerous</button>
    `;
    const allowed = vi.spyOn(document.querySelector<HTMLButtonElement>("#allowed")!, "click");
    const dangerous = vi.spyOn(document.querySelector<HTMLButtonElement>("#dangerous")!, "click");
    const action = { type: "message_and_click", payload: { element: "#dangerous", text: "Done" } };
    const context = { document } as never;

    defaultActionHandlers.messageAndClick(action, context);
    createMessageAndClickActionHandler(["#safe"])(action, context);
    vi.runAllTimers();
    expect(dangerous).not.toHaveBeenCalled();

    createMessageAndClickActionHandler(["#safe"])(
      { ...action, payload: { element: "#allowed", text: "Done" } },
      context
    );
    vi.runAllTimers();
    expect(allowed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("defaultJsonActionParser", () => {
  it("parses valid action JSON", () => {
    const result = defaultJsonActionParser({
      text: '{"action":"message","text":"hi"}',
      message: makeMessage(),
    });
    expect(result).toEqual({
      type: "message",
      payload: { text: "hi" },
      raw: { action: "message", text: "hi" },
    });
  });

  it("returns null for non-action JSON", () => {
    const result = defaultJsonActionParser({
      text: '{"foo":"bar"}',
      message: makeMessage(),
    });
    expect(result).toBeNull();
  });

  it("returns null for non-JSON text", () => {
    const result = defaultJsonActionParser({
      text: "hello world",
      message: makeMessage(),
    });
    expect(result).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(defaultJsonActionParser({ text: "", message: makeMessage() })).toBeNull();
  });

  it("strips code fences before parsing", () => {
    const text = '```json\n{"action":"message","text":"fenced"}\n```';
    const result = defaultJsonActionParser({ text, message: makeMessage() });
    expect(result).toEqual({
      type: "message",
      payload: { text: "fenced" },
      raw: { action: "message", text: "fenced" },
    });
  });
});

describe("createActionManager.process", () => {
  const makeManager = (overrides?: Record<string, unknown>) => {
    let metadata: Record<string, unknown> = {};
    return createActionManager({
      parsers: [defaultJsonActionParser],
      handlers: [defaultActionHandlers.message],
      getSessionMetadata: () => metadata,
      updateSessionMetadata: (updater) => { metadata = updater(metadata); },
      emit: vi.fn(),
      documentRef: null,
      ...overrides,
    });
  };

  it("skips streaming messages", () => {
    const manager = makeManager();
    const result = manager.process({
      text: '{"action":"message","text":"hi"}',
      message: makeMessage(),
      streaming: true,
    });
    expect(result).toBeNull();
  });

  it("skips non-assistant messages", () => {
    const manager = makeManager();
    const result = manager.process({
      text: '{"action":"message","text":"hi"}',
      message: makeMessage({ role: "user" }),
      streaming: false,
    });
    expect(result).toBeNull();
  });

  it("deduplicates by message ID", () => {
    const manager = makeManager();
    const msg = makeMessage({ content: '{"action":"message","text":"hi"}' });
    const first = manager.process({ text: msg.content, message: msg, streaming: false });
    expect(first).not.toBeNull();

    const second = manager.process({ text: msg.content, message: msg, streaming: false });
    expect(second).toBeNull();
  });

  it("processes valid action and returns display text", () => {
    const manager = makeManager();
    const result = manager.process({
      text: '{"action":"message","text":"hello"}',
      message: makeMessage(),
      streaming: false,
    });
    expect(result).toEqual({ text: "hello", persist: true, resubmit: undefined });
  });
});
