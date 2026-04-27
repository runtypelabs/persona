// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  ASK_USER_QUESTION_MAX,
  ASK_USER_QUESTION_TOOL_NAME,
  __resetTruncateWarn,
  buildStructuredAnswers,
  createAskUserQuestionBubble,
  ensureAskUserQuestionSheet,
  getCurrentIndex,
  getQuestionCount,
  getSelectedLabels,
  isAskUserQuestionMessage,
  isGroupedSheet,
  navigateToPage,
  readAnswersFromSheet,
  removeAskUserQuestionSheet,
  setCurrentAnswer,
} from "./ask-user-question-bubble";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AskUserQuestionPrompt,
} from "../types";

const makeMessage = (overrides: Partial<AgentWidgetMessage> = {}): AgentWidgetMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  variant: "tool",
  streaming: false,
  toolCall: {
    id: "tool-1",
    name: ASK_USER_QUESTION_TOOL_NAME,
    status: "complete",
    args: {
      questions: [
        {
          question: "Who shops on your site?",
          options: [
            { label: "Hobbyists" },
            { label: "Professionals" },
            { label: "Gift-seekers" },
          ],
          multiSelect: false,
          allowFreeText: true,
        },
      ],
    },
    chunks: [],
  },
  ...overrides,
});

const makeOverlay = () => {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-persona-composer-overlay", "");
  document.body.innerHTML = "";
  document.body.appendChild(overlay);
  return overlay;
};

describe("isAskUserQuestionMessage", () => {
  it("is true for a tool-variant message whose toolCall.name is ask_user_question", () => {
    expect(isAskUserQuestionMessage(makeMessage())).toBe(true);
  });

  it("is false for other tool calls", () => {
    const other = makeMessage({
      toolCall: {
        id: "t2",
        name: "search_products",
        status: "complete",
        chunks: [],
      },
    });
    expect(isAskUserQuestionMessage(other)).toBe(false);
  });

  it("is false for non-tool variants", () => {
    const notTool = makeMessage({ variant: undefined, toolCall: undefined });
    expect(isAskUserQuestionMessage(notTool)).toBe(false);
  });
});

describe("createAskUserQuestionBubble", () => {
  it("renders a compact transcript stub carrying the message id", () => {
    const bubble = createAskUserQuestionBubble(makeMessage());
    expect(bubble.getAttribute("data-message-id")).toBe("msg-1");
    expect(bubble.getAttribute("data-bubble-type")).toBe("ask-user-question");
    expect(bubble.textContent).toContain("Awaiting");
  });
});

describe("ensureAskUserQuestionSheet", () => {
  it("mounts a sheet in the overlay with real pills when args are complete", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);

    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]');
    expect(sheet).not.toBeNull();
    const pills = sheet!.querySelectorAll('[data-ask-user-action="pick"]');
    expect(pills.length).toBe(3);
    // Default rows layout — label is in `.persona-ask-row-label`, alongside
    // a number-badge affordance. Read the dedicated label slot.
    const firstLabel = pills[0].querySelector(".persona-ask-row-label");
    expect(firstLabel?.textContent).toBe("Hobbyists");
    // Free-text affordance present by default — rows mode embeds the input
    // inside the Other row via `focus-free-text` (digit shortcut + click chrome).
    const custom = sheet!.querySelector('[data-ask-user-action="focus-free-text"]');
    expect(custom).not.toBeNull();
  });

  it("renders skeleton pills while streaming (status=running, no parsable chunks)", () => {
    const overlay = makeOverlay();
    const streaming = makeMessage({
      toolCall: {
        id: "tool-streaming",
        name: ASK_USER_QUESTION_TOOL_NAME,
        status: "running",
        chunks: ['{"ques'],
      },
    });
    ensureAskUserQuestionSheet(streaming, {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-streaming"]');
    expect(sheet).not.toBeNull();
    const skeletons = sheet!.querySelectorAll(".persona-ask-pill-skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
    const realPills = sheet!.querySelectorAll('[data-ask-user-action="pick"]');
    expect(realPills.length).toBe(0);
  });

  it("hydrates skeleton pills into real pills when streaming chunks become parsable", () => {
    const overlay = makeOverlay();
    const msg = makeMessage({
      toolCall: {
        id: "tool-hyd",
        name: ASK_USER_QUESTION_TOOL_NAME,
        status: "running",
        chunks: ['{"questions":[{"question":"X","options":['],
      },
    });
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);

    // Simulate more chunks arriving — options now parseable
    msg.toolCall!.chunks = ['{"questions":[{"question":"X","options":[{"label":"A"},{"label":"B"}'];
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);

    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-hyd"]')!;
    const pills = sheet.querySelectorAll('[data-ask-user-action="pick"]');
    expect(pills.length).toBe(2);
    expect(pills[0].querySelector(".persona-ask-row-label")?.textContent).toBe("A");
    expect(pills[1].querySelector(".persona-ask-row-label")?.textContent).toBe("B");
  });

  it("is idempotent — re-invoking does not duplicate sheets", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    const sheets = overlay.querySelectorAll('[data-persona-ask-sheet-for]');
    expect(sheets.length).toBe(1);
  });

  it("respects enabled: false — sheet is not mounted", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(
      makeMessage(),
      { features: { askUserQuestion: { enabled: false } } } as AgentWidgetConfig,
      overlay
    );
    expect(overlay.querySelector('[data-persona-ask-sheet-for]')).toBeNull();
  });

  it("omits the free-text pill when allowFreeText is false", () => {
    const overlay = makeOverlay();
    const msg = makeMessage();
    (msg.toolCall!.args as any).questions[0].allowFreeText = false;
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    expect(sheet.querySelector('[data-ask-user-action="open-free-text"]')).toBeNull();
  });

  it("renders a multi-select submit row when multiSelect is true", () => {
    const overlay = makeOverlay();
    const msg = makeMessage();
    (msg.toolCall!.args as any).questions[0].multiSelect = true;
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    expect(sheet.querySelector('[data-ask-user-action="submit-multi"]')).not.toBeNull();
    expect(sheet.getAttribute("data-multi-select")).toBe("true");
  });

  it("does not render a dismiss button — Skip in the nav row is the canonical escape", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    expect(sheet.querySelector('[data-ask-user-action="dismiss"]')).toBeNull();
    expect(sheet.querySelector(".persona-ask-sheet-close")).toBeNull();
  });
});

describe("getSelectedLabels", () => {
  it("collects labels from pills with aria-pressed=true", () => {
    const overlay = makeOverlay();
    const msg = makeMessage();
    (msg.toolCall!.args as any).questions[0].multiSelect = true;
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    const pills = sheet.querySelectorAll<HTMLElement>('[data-ask-user-action="pick"]');
    pills[0].setAttribute("aria-pressed", "true");
    pills[2].setAttribute("aria-pressed", "true");
    expect(getSelectedLabels(sheet as HTMLElement)).toEqual(["Hobbyists", "Gift-seekers"]);
  });
});

describe("removeAskUserQuestionSheet", () => {
  it("removes the sheet for a specific tool-call id after the slide-out delay", async () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    expect(overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')).not.toBeNull();
    removeAskUserQuestionSheet(overlay, "tool-1");
    // The implementation defers removal with setTimeout — flush it.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')).toBeNull();
  });
});

// ============================================================================
// Grouped (paginated) multi-question payloads
// ============================================================================

const makeGroupedMessage = (
  questions: Partial<AskUserQuestionPrompt>[],
  agentMetadata?: AgentWidgetMessage["agentMetadata"]
): AgentWidgetMessage =>
  makeMessage({
    toolCall: {
      id: "tool-grouped",
      name: ASK_USER_QUESTION_TOOL_NAME,
      status: "complete",
      args: { questions },
      chunks: [],
    },
    agentMetadata,
  });

const sheetFor = (overlay: Element, toolCallId: string): HTMLElement =>
  overlay.querySelector<HTMLElement>(`[data-persona-ask-sheet-for="${toolCallId}"]`)!;

describe("grouped questions — stepper UI", () => {
  it("renders 'Question 1 of N' chip and Back/Next nav row when N > 1", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
      { question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
      { question: "Q3?", options: [{ label: "E" }, { label: "F" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");

    expect(isGroupedSheet(sheet)).toBe(true);
    expect(getQuestionCount(sheet)).toBe(3);
    expect(getCurrentIndex(sheet)).toBe(0);

    const stepInline = sheet.querySelector('[data-ask-step-inline="true"]');
    expect(stepInline?.textContent).toBe("1/3");

    expect(sheet.querySelector('[data-ask-user-action="back"]')).not.toBeNull();
    expect(sheet.querySelector('[data-ask-user-action="next"]')).not.toBeNull();
    expect(sheet.querySelector('[data-ask-user-action="submit-all"]')).toBeNull();
  });

  it("leaves the inline stepper empty in single-Q mode (no grouped UI)", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-1");

    expect(isGroupedSheet(sheet)).toBe(false);
    const stepInline = sheet.querySelector('[data-ask-step-inline="true"]');
    expect(stepInline?.textContent).toBe("");
    expect(sheet.querySelector('[data-ask-nav-row="true"]')).toBeNull();
  });

  it("Next is disabled until current page has an answer; enabled after pick", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
      { question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");
    const next = sheet.querySelector<HTMLButtonElement>('[data-ask-user-action="next"]')!;
    expect(next.disabled).toBe(true);

    setCurrentAnswer(sheet, "A");
    expect(next.disabled).toBe(false);
    const pillA = sheet.querySelector<HTMLElement>('[data-option-label="A"]');
    expect(pillA?.getAttribute("aria-pressed")).toBe("true");
  });

  it("navigateToPage(1) shows page 2 and Back becomes enabled; Submit-all on final page", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Q1?", options: [{ label: "A" }] },
      { question: "Q2?", options: [{ label: "B" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");
    setCurrentAnswer(sheet, "A");
    navigateToPage(sheet, msg, undefined, 1);

    const back = sheet.querySelector<HTMLButtonElement>('[data-ask-user-action="back"]')!;
    expect(back.disabled).toBe(false);
    const submitAll = sheet.querySelector('[data-ask-user-action="submit-all"]');
    expect(submitAll).not.toBeNull();
    expect(sheet.querySelector('[data-ask-user-action="next"]')).toBeNull();

    const stepInline = sheet.querySelector('[data-ask-step-inline="true"]');
    expect(stepInline?.textContent).toBe("2/2");
  });

  it("Back from page 2 → page 1 preserves the prior answer's selected pill state", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
      { question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");

    setCurrentAnswer(sheet, "A");
    navigateToPage(sheet, msg, undefined, 1);
    setCurrentAnswer(sheet, "C");
    navigateToPage(sheet, msg, undefined, 0);

    const pillA = sheet.querySelector<HTMLElement>('[data-option-label="A"]');
    expect(pillA?.getAttribute("aria-pressed")).toBe("true");
    expect(getCurrentIndex(sheet)).toBe(0);
  });

  it("multi-select page stores an array; pill toggles preserve other selections", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      {
        question: "Pick many",
        options: [{ label: "X" }, { label: "Y" }, { label: "Z" }],
        multiSelect: true,
        allowFreeText: false,
      },
      { question: "Q2?", options: [{ label: "A" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");

    setCurrentAnswer(sheet, ["X", "Z"]);
    const stored = readAnswersFromSheet(sheet)[0];
    expect(stored).toEqual(["X", "Z"]);
    const pillX = sheet.querySelector<HTMLElement>('[data-option-label="X"]');
    const pillY = sheet.querySelector<HTMLElement>('[data-option-label="Y"]');
    const pillZ = sheet.querySelector<HTMLElement>('[data-option-label="Z"]');
    expect(pillX?.getAttribute("aria-pressed")).toBe("true");
    expect(pillY?.getAttribute("aria-pressed")).toBe("false");
    expect(pillZ?.getAttribute("aria-pressed")).toBe("true");
  });

  it("buildStructuredAnswers keys answers by question text", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Tone?", options: [{ label: "Bold" }] },
      { question: "Length?", options: [{ label: "Short" }, { label: "Long" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");

    setCurrentAnswer(sheet, "Bold");
    navigateToPage(sheet, msg, undefined, 1);
    setCurrentAnswer(sheet, "Short");

    expect(buildStructuredAnswers(sheet, msg)).toEqual({
      "Tone?": "Bold",
      "Length?": "Short",
    });
  });

  it("hydrates from agentMetadata — restores index and prior answers on a fresh mount", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage(
      [
        { question: "Q1?", options: [{ label: "A" }, { label: "B" }] },
        { question: "Q2?", options: [{ label: "C" }, { label: "D" }] },
        { question: "Q3?", options: [{ label: "E" }, { label: "F" }] },
      ],
      {
        askUserQuestionAnswers: { "Q1?": "B", "Q2?": "D" },
        askUserQuestionIndex: 1,
      }
    );
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");

    expect(getCurrentIndex(sheet)).toBe(1);
    const pillD = sheet.querySelector<HTMLElement>('[data-option-label="D"]');
    expect(pillD?.getAttribute("aria-pressed")).toBe("true");
    expect(buildStructuredAnswers(sheet, msg)).toEqual({ "Q1?": "B", "Q2?": "D" });
  });

  it("renders all 8 questions when at the cap, and warns + truncates at 9", () => {
    __resetTruncateWarn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const overlay = makeOverlay();
    const eight: Partial<AskUserQuestionPrompt>[] = Array.from({ length: 8 }, (_, i) => ({
      question: `Q${i + 1}?`,
      options: [{ label: `${i + 1}-A` }],
    }));
    ensureAskUserQuestionSheet(makeGroupedMessage(eight), {} as AgentWidgetConfig, overlay);
    let sheet = sheetFor(overlay, "tool-grouped");
    expect(getQuestionCount(sheet)).toBe(ASK_USER_QUESTION_MAX);
    expect(warn).not.toHaveBeenCalled();

    overlay.innerHTML = "";
    const nine = [...eight, { question: "overflow", options: [{ label: "X" }] }];
    ensureAskUserQuestionSheet(makeGroupedMessage(nine), {} as AgentWidgetConfig, overlay);
    sheet = sheetFor(overlay, "tool-grouped");
    expect(getQuestionCount(sheet)).toBe(ASK_USER_QUESTION_MAX);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("truncating to");

    warn.mockRestore();
  });
});

describe("rows layout (default)", () => {
  it("renders option rows with description visible inline (not in title attr)", () => {
    const overlay = makeOverlay();
    const msg = makeMessage({
      toolCall: {
        id: "tool-rows-desc",
        name: ASK_USER_QUESTION_TOOL_NAME,
        status: "complete",
        args: {
          questions: [
            {
              question: "Pick one",
              options: [
                { label: "Discord", description: "Real Discord invite to link" },
                { label: "Slack", description: "Public Slack community" },
              ],
              multiSelect: false,
              allowFreeText: false,
            },
          ],
        },
        chunks: [],
      },
    });
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-rows-desc"]')!;
    expect(sheet.getAttribute("data-ask-layout")).toBe("rows");
    const firstRow = sheet.querySelector<HTMLElement>('[data-ask-user-action="pick"]')!;
    expect(firstRow.querySelector(".persona-ask-row-label")?.textContent).toBe("Discord");
    expect(firstRow.querySelector(".persona-ask-row-description")?.textContent).toBe(
      "Real Discord invite to link"
    );
    // No title-attr fallback in rows layout — description is inline.
    expect(firstRow.getAttribute("title")).toBeNull();
  });

  it("shows numeric badges 1..N on single-select rows", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    const rows = sheet.querySelectorAll<HTMLElement>('[data-ask-user-action="pick"]');
    expect(rows[0].querySelector(".persona-ask-row-badge")?.textContent).toBe("1");
    expect(rows[1].querySelector(".persona-ask-row-badge")?.textContent).toBe("2");
    expect(rows[2].querySelector(".persona-ask-row-badge")?.textContent).toBe("3");
    // Multi-select check should NOT be present on single-select rows.
    expect(rows[0].querySelector(".persona-ask-row-check")).toBeNull();
  });

  it("shows checkbox affordance instead of badge on multi-select rows", () => {
    const overlay = makeOverlay();
    const multi = makeMessage({
      toolCall: {
        id: "tool-multi",
        name: ASK_USER_QUESTION_TOOL_NAME,
        status: "complete",
        args: {
          questions: [
            {
              question: "Pick any",
              options: [{ label: "A" }, { label: "B" }],
              multiSelect: true,
              allowFreeText: false,
            },
          ],
        },
        chunks: [],
      },
    });
    ensureAskUserQuestionSheet(multi, {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-multi"]')!;
    const rows = sheet.querySelectorAll<HTMLElement>('[data-ask-user-action="pick"]');
    expect(rows[0].querySelector(".persona-ask-row-check")).not.toBeNull();
    expect(rows[0].querySelector(".persona-ask-row-badge")).toBeNull();
  });

  it("embeds the free-text input INSIDE the Other row (rows mode) — no separate row, no Send button", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    // No standalone free-text row in rows mode — input lives inside the Other row.
    expect(sheet.querySelector('[data-ask-free-text-row="true"]')).toBeNull();
    const otherRow = sheet.querySelector<HTMLElement>('[data-ask-other-row="true"]')!;
    expect(otherRow).not.toBeNull();
    expect(otherRow.classList.contains("persona-ask-row--other")).toBe(true);
    expect(otherRow.querySelector('[data-ask-free-text-input="true"]')).not.toBeNull();
    expect(otherRow.querySelector('[data-ask-user-action="submit-free-text"]')).toBeNull();
    // Other row carries the focus-free-text action (digit shortcut + click chrome).
    expect(otherRow.getAttribute("data-ask-user-action")).toBe("focus-free-text");
    // Number badge for the Other row (N+1 — 3 real options + Other = 4).
    const badge = otherRow.querySelector<HTMLElement>(".persona-ask-row-badge");
    expect(badge?.textContent).toBe("4");
  });

  it("respects layout: 'pills' opt-out — no row affordances, free-text starts hidden, Send button still rendered", () => {
    const overlay = makeOverlay();
    const config = {
      features: { askUserQuestion: { layout: "pills" } },
    } as unknown as AgentWidgetConfig;
    ensureAskUserQuestionSheet(makeMessage(), config, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    expect(sheet.getAttribute("data-ask-layout")).toBe("pills");
    const firstPill = sheet.querySelector<HTMLElement>('[data-ask-user-action="pick"]')!;
    expect(firstPill.querySelector(".persona-ask-row-label")).toBeNull();
    expect(firstPill.querySelector(".persona-ask-row-badge")).toBeNull();
    expect(firstPill.textContent).toBe("Hobbyists");
    const freeRow = sheet.querySelector<HTMLElement>('[data-ask-free-text-row="true"]')!;
    expect(freeRow.classList.contains("persona-hidden")).toBe(true);
    // Pills mode keeps the Send button to commit the expand-on-click input.
    expect(freeRow.querySelector('[data-ask-user-action="submit-free-text"]')).not.toBeNull();
  });
});

describe("Skip button", () => {
  it("renders a Skip button alongside Next in the grouped nav row", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Q1", options: [{ label: "A" }] },
      { question: "Q2", options: [{ label: "B" }] },
    ]);
    ensureAskUserQuestionSheet(msg, {} as AgentWidgetConfig, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");
    const skip = sheet.querySelector<HTMLButtonElement>('[data-ask-user-action="skip"]');
    expect(skip).not.toBeNull();
    expect(skip!.disabled).toBe(false);
    expect(skip!.textContent).toBe("Skip");
  });

  it("uses the configured skipLabel override", () => {
    const overlay = makeOverlay();
    const msg = makeGroupedMessage([
      { question: "Q1", options: [{ label: "A" }] },
      { question: "Q2", options: [{ label: "B" }] },
    ]);
    const config = {
      features: { askUserQuestion: { skipLabel: "Pass" } },
    } as unknown as AgentWidgetConfig;
    ensureAskUserQuestionSheet(msg, config, overlay);
    const sheet = sheetFor(overlay, "tool-grouped");
    const skip = sheet.querySelector<HTMLButtonElement>('[data-ask-user-action="skip"]')!;
    expect(skip.textContent).toBe("Pass");
  });

  it("does not render a Skip button in single-question (non-grouped) mode", () => {
    const overlay = makeOverlay();
    ensureAskUserQuestionSheet(makeMessage(), {} as AgentWidgetConfig, overlay);
    const sheet = overlay.querySelector('[data-persona-ask-sheet-for="tool-1"]')!;
    expect(sheet.querySelector('[data-ask-user-action="skip"]')).toBeNull();
  });
});
