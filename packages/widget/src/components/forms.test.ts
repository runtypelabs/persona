// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { enhanceWithForms, parseFormResponse } from "./forms";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";

afterEach(() => vi.unstubAllGlobals());

describe("built-in forms", () => {
  it("bounds and validates endpoint response JSON", () => {
    expect(parseFormResponse('{"success":true,"message":"ok","nextPrompt":"trusted"}'))
      .toEqual({ success: true, message: "ok", nextPrompt: "trusted" });
    expect(() => parseFormResponse('[]')).toThrow("invalid response");
    expect(() => parseFormResponse("x".repeat(70_000))).toThrow("too large");
  });

  it("submits nextPrompt only when the integrator explicitly allowlists it", async () => {
    const bubble = document.createElement("div");
    bubble.innerHTML = '<div data-tv-form="init"></div>';
    const sendMessage = vi.fn(async () => undefined);
    const response = { success: true, message: "Saved", nextPrompt: "continue safely" };
    const fetchMock = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) =>
      new Response(JSON.stringify(response), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const message = { id: "m", role: "assistant", content: "", createdAt: "now" } as AgentWidgetMessage;

    enhanceWithForms(bubble, message, { formEndpoint: "/form" } as AgentWidgetConfig, { sendMessage } as never);
    bubble.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });

    const trustedBubble = document.createElement("div");
    trustedBubble.innerHTML = '<div data-tv-form="init"></div>';
    enhanceWithForms(
      trustedBubble,
      message,
      { formEndpoint: "/form", formNextPromptAllowlist: ["continue safely"] } as AgentWidgetConfig,
      { sendMessage } as never
    );
    trustedBubble.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith("continue safely"));
  });
});
