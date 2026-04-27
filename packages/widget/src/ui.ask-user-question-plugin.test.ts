// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const injectAskUserQuestion = (
  controller: ReturnType<typeof createAgentExperience>,
  { id = "tool-1", status = "complete" as const, args }: {
    id?: string;
    status?: "pending" | "running" | "complete";
    args?: unknown;
  } = {}
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: "2026-04-24T00:00:00.000Z",
      streaming: false,
      variant: "tool",
      toolCall: {
        id,
        name: "ask_user_question",
        status,
        args: args ?? {
          questions: [
            { question: "Which audience?", options: [{ label: "Hobbyists" }, { label: "Pros" }] },
          ],
        },
        chunks: [],
      },
      agentMetadata: {
        executionId: "exec_123",
        awaitingLocalTool: true,
      },
    },
  });
};

describe("renderAskUserQuestion plugin hook", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders a plugin-returned element inline in the transcript when provided", () => {
    const plugin: AgentWidgetPlugin = {
      id: "custom-asker",
      renderAskUserQuestion: ({ payload }) => {
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "custom-ask");
        root.textContent = payload?.questions?.[0]?.question ?? "";
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);

    const custom = mount.querySelector('[data-test-id="custom-ask"]');
    expect(custom).not.toBeNull();
    expect(custom?.textContent).toBe("Which audience?");

    // The built-in overlay sheet must NOT be mounted when a plugin handles the UI.
    const overlaySheet = mount.querySelector("[data-persona-ask-sheet-for]");
    expect(overlaySheet).toBeNull();

    controller.destroy();
  });

  it("falls back to the built-in overlay sheet when the plugin returns null", () => {
    const plugin: AgentWidgetPlugin = {
      id: "passthrough-asker",
      renderAskUserQuestion: () => null,
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);

    const overlaySheet = mount.querySelector("[data-persona-ask-sheet-for]");
    expect(overlaySheet).not.toBeNull();

    controller.destroy();
  });

  it("does not duplicate the built-in sheet on re-render when a plugin owns the message", () => {
    const plugin: AgentWidgetPlugin = {
      id: "owning-plugin",
      renderAskUserQuestion: ({ payload }) => {
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "owning-plugin");
        root.textContent = payload?.questions?.[0]?.question ?? "";
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);
    expect(mount.querySelector("[data-persona-ask-sheet-for]")).toBeNull();

    // Force a re-render by injecting a second message — the ask_user_question
    // wrapper now goes through the render path again. The built-in overlay
    // sheet must NOT appear; the plugin still owns the UI.
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "user-1",
        role: "user",
        content: "ping",
        createdAt: "2026-04-26T00:00:00.000Z",
        streaming: false,
      },
    });

    expect(mount.querySelector("[data-persona-ask-sheet-for]")).toBeNull();
    expect(mount.querySelector('[data-test-id="owning-plugin"]')).not.toBeNull();

    controller.destroy();
  });

  it("preserves plugin button click listeners across morph re-renders", () => {
    const resolveSpy = vi.fn();
    const plugin: AgentWidgetPlugin = {
      id: "click-listener-plugin",
      renderAskUserQuestion: ({ resolve }) => {
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "click-root");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-test-id", "click-pill");
        btn.textContent = "Pick me";
        // Single delegated listener at root — pattern recommended for plugins.
        root.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).getAttribute("data-test-id") === "click-pill") {
            resolve("Pick me");
            resolveSpy();
          }
        });
        root.appendChild(btn);
        return root;
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);

    // Force a re-render before the click — this is exactly the scenario
    // where innerHTML-based morph used to drop listeners on the freshly-built
    // plugin root.
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "noise",
        role: "user",
        content: "noise",
        createdAt: "2026-04-26T00:00:00.000Z",
        streaming: false,
      },
    });

    const pill = mount.querySelector<HTMLButtonElement>('[data-test-id="click-pill"]');
    expect(pill).not.toBeNull();
    pill!.click();
    expect(resolveSpy).toHaveBeenCalled();

    controller.destroy();
  });

  it("suppresses the plugin's interactive sheet once answered and injects Q→A pair messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    // Plugin renders an interactive card while the question is awaiting an
    // answer. Once answered, the widget suppresses the original tool message
    // entirely — the plugin renderer is invoked but returns null — and the
    // session injects Q→A pair messages (assistant question + user answer)
    // that render through the standard transcript pipeline.
    const plugin: AgentWidgetPlugin = {
      id: "click-pill-plugin",
      renderAskUserQuestion: ({ message, payload, resolve }) => {
        if (message?.agentMetadata?.askUserQuestionAnswered === true) {
          return null;
        }
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "interactive-card");
        const opts = payload?.questions?.[0]?.options ?? [];
        opts.forEach((opt) => {
          if (!opt?.label) return;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = opt.label;
          btn.setAttribute("data-test-id", `pick-${opt.label}`);
          btn.addEventListener("click", () => resolve(opt.label));
          root.appendChild(btn);
        });
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);

    expect(mount.querySelector('[data-test-id="interactive-card"]')).not.toBeNull();

    const pick = mount.querySelector<HTMLButtonElement>('[data-test-id="pick-Hobbyists"]');
    expect(pick).not.toBeNull();
    pick!.click();

    await Promise.resolve();
    await Promise.resolve();

    // After answer: interactive card gone, no built-in answered card, and
    // the transcript contains the Q→A pair messages with the picked answer.
    expect(mount.querySelector('[data-test-id="interactive-card"]')).toBeNull();
    expect(mount.querySelector('[data-ask-answered-card="true"]')).toBeNull();
    expect(mount.textContent).toContain("Which audience?");
    expect(mount.textContent).toContain("Hobbyists");

    controller.destroy();
  });

  it("ignores rapid double-clicks on the same answer pill (idempotent resolve)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    let resolveRef: ((answer: string) => void) | undefined;
    const plugin: AgentWidgetPlugin = {
      id: "double-click-plugin",
      renderAskUserQuestion: ({ resolve }) => {
        resolveRef = resolve;
        const el = document.createElement("div");
        el.setAttribute("data-test-id", "dbl");
        return el;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);
    expect(resolveRef).toBeDefined();

    // Three rapid resolves before any re-render cycle settles.
    resolveRef!("First");
    resolveRef!("Second");
    resolveRef!("Third");

    await Promise.resolve();
    await Promise.resolve();

    // Only the FIRST answer should have hit the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.toolOutputs.ask_user_question).toBe("First");

    controller.destroy();
  });

  it("auto-advances to the next page when a single-select pill is picked in grouped mode (default)", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller, {
      args: {
        questions: [
          { question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
          { question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
          { question: "Q3?", options: [{ label: "E" }, { label: "F" }] },
        ],
      },
    });

    const sheet = mount.querySelector<HTMLElement>("[data-persona-ask-sheet-for]")!;
    expect(sheet.getAttribute("data-ask-current-index")).toBe("0");
    (sheet.querySelector('[data-option-label="A"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("1");

    // Final page: pick should NOT auto-submit — Submit-all button still present.
    (sheet.querySelector('[data-option-label="C"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("2");
    (sheet.querySelector('[data-option-label="E"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("2");
    expect(sheet.querySelector('[data-ask-user-action="submit-all"]')).not.toBeNull();
    expect(mount.querySelector("[data-persona-ask-sheet-for]")).not.toBeNull();

    controller.destroy();
  });

  it("injects Q→A pair messages with the user's picks (not '*Skipped*') after submit-all", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller, {
      args: {
        questions: [
          { header: "Tone", question: "Pick a tone", options: [{ label: "Story-driven" }, { label: "Punchy" }] },
          { header: "Sections", question: "Pick a section", options: [{ label: "Testimonials" }, { label: "Hero" }] },
          { header: "CTA", question: "Pick a CTA", options: [{ label: "Sign up" }, { label: "Buy now" }] },
        ],
      },
    });

    const sheet = mount.querySelector<HTMLElement>("[data-persona-ask-sheet-for]")!;

    // Page 1 → pick Story-driven, auto-advance to page 2.
    (sheet.querySelector('[data-option-label="Story-driven"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("1");

    // Page 2 → pick Testimonials, auto-advance to page 3.
    (sheet.querySelector('[data-option-label="Testimonials"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("2");

    // Page 3 (final) → pick Sign up. Final page does NOT auto-submit.
    (sheet.querySelector('[data-option-label="Sign up"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("2");

    // Click Submit-all → fires resolveAskUserQuestion + transitions to answered.
    const submitAll = sheet.querySelector<HTMLButtonElement>(
      '[data-ask-user-action="submit-all"]'
    )!;
    expect(submitAll.disabled).toBe(false);
    submitAll.click();

    await Promise.resolve();
    await Promise.resolve();

    // Original tool message suppressed; transcript now contains assistant Q
    // bubbles + user A bubbles in alternating order. Each picked answer
    // appears in the transcript, none rendered as "*Skipped*".
    expect(mount.querySelector('[data-ask-answered-card="true"]')).toBeNull();
    const transcriptText = mount.textContent ?? "";
    expect(transcriptText).toContain("Pick a tone");
    expect(transcriptText).toContain("Story-driven");
    expect(transcriptText).toContain("Pick a section");
    expect(transcriptText).toContain("Testimonials");
    expect(transcriptText).toContain("Pick a CTA");
    expect(transcriptText).toContain("Sign up");
    expect(transcriptText).not.toContain("*Skipped*");

    controller.destroy();
  });

  it("includes pending free-text answer on the final page in the Q→A transcript (not '*Skipped*')", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller, {
      args: {
        questions: [
          { header: "Tone", question: "Pick a tone", options: [{ label: "Story-driven" }, { label: "Punchy" }] },
          { header: "Sections", question: "Pick a section", options: [{ label: "Testimonials" }, { label: "Hero" }] },
          { header: "CTA", question: "Pick a CTA", options: [{ label: "Sign up" }, { label: "Buy now" }] },
        ],
      },
    });

    const sheet = mount.querySelector<HTMLElement>("[data-persona-ask-sheet-for]")!;

    // Page 1 → pick Story-driven, auto-advance to page 2.
    (sheet.querySelector('[data-option-label="Story-driven"]') as HTMLElement).click();
    // Page 2 → pick Testimonials, auto-advance to page 3.
    (sheet.querySelector('[data-option-label="Testimonials"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("2");

    // Page 3 → user types free-text "test" without clicking Send first, then
    // hits Submit-all directly. The free-text input value must be flushed
    // through to BOTH the structured payload AND the persisted metadata so
    // the answered review card reflects the user's actual answer.
    // User flow: type "test", press Enter to submit-free-text (which is the
    // gate that persists the answer to message metadata + enables Submit-all),
    // then click Submit-all.
    const freeInput = sheet.querySelector<HTMLInputElement>(
      '[data-ask-free-text-input="true"]'
    )!;
    freeInput.value = "test";
    freeInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    const submitAll = sheet.querySelector<HTMLButtonElement>(
      '[data-ask-user-action="submit-all"]'
    )!;
    submitAll.click();

    await Promise.resolve();
    await Promise.resolve();

    expect(mount.querySelector('[data-ask-answered-card="true"]')).toBeNull();
    const transcriptText = mount.textContent ?? "";
    expect(transcriptText).toContain("Story-driven");
    expect(transcriptText).toContain("Testimonials");
    // The free-text value typed on the final page should also appear.
    expect(transcriptText).toContain("test");
    expect(transcriptText).not.toContain("*Skipped*");

    controller.destroy();
  });

  it("digit keyboard shortcut picks the matching row even when focus is on document.body", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller, {
      args: {
        questions: [
          { question: "Q1?", options: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }] },
          { question: "Q2?", options: [{ label: "X" }, { label: "Y" }] },
        ],
      },
    });

    const sheet = mount.querySelector<HTMLElement>("[data-persona-ask-sheet-for]")!;
    expect(sheet.getAttribute("data-ask-layout")).toBe("rows");
    expect(sheet.getAttribute("data-ask-current-index")).toBe("0");

    // Focus on body — no element inside the overlay subtree is focused.
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur?.();
    }

    // Dispatch the digit keypress on `mount` — the listener on `mount`
    // catches it regardless of focus location. In grouped single-select mode,
    // a successful pick auto-advances to the next page (default behavior).
    mount.dispatchEvent(
      new KeyboardEvent("keydown", { key: "2", bubbles: true })
    );

    expect(sheet.getAttribute("data-ask-current-index")).toBe("1");

    controller.destroy();
  });

  it("digit keypress is not hijacked when typing into the free-text input", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller, {
      args: {
        questions: [
          {
            question: "Pick one",
            options: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }],
            allowFreeText: true,
          },
        ],
      },
    });

    const sheet = mount.querySelector<HTMLElement>("[data-persona-ask-sheet-for]")!;
    const input = sheet.querySelector<HTMLInputElement>(
      '[data-ask-free-text-input="true"]'
    )!;
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "2", bubbles: true })
    );

    // No row should have been picked — input is the focused target so the
    // mount-level handler bails out.
    const beta = sheet.querySelector<HTMLElement>('[data-option-label="Beta"]')!;
    expect(beta.getAttribute("aria-pressed")).toBe("false");

    controller.destroy();
  });

  it("respects groupedAutoAdvance: false — pick stays on current page", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { askUserQuestion: { groupedAutoAdvance: false } },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller, {
      args: {
        questions: [
          { question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
          { question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
        ],
      },
    });

    const sheet = mount.querySelector<HTMLElement>("[data-persona-ask-sheet-for]")!;
    (sheet.querySelector('[data-option-label="A"]') as HTMLElement).click();
    expect(sheet.getAttribute("data-ask-current-index")).toBe("0");
    const pillA = sheet.querySelector('[data-option-label="A"]');
    expect(pillA?.getAttribute("aria-pressed")).toBe("true");

    controller.destroy();
  });

  it("wires resolve(answer) to session.resolveAskUserQuestion via /resume", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    let resolveRef: ((answer: string) => void) | undefined;
    const plugin: AgentWidgetPlugin = {
      id: "capturing-asker",
      renderAskUserQuestion: ({ resolve }) => {
        resolveRef = resolve;
        const el = document.createElement("div");
        el.setAttribute("data-test-id", "capturing");
        return el;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectAskUserQuestion(controller);

    expect(resolveRef).toBeDefined();
    resolveRef!("Hobbyists");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/resume$/);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      executionId: "exec_123",
      toolOutputs: { ["ask_user_question"]: "Hobbyists" },
      streamResponse: true,
    });

    controller.destroy();
  });
});
