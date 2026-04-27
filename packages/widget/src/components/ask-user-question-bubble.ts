import { parse as parsePartialJson, ARR, OBJ, STR } from "partial-json";
import { createElement } from "../utils/dom";
import {
  AgentWidgetAskUserQuestionFeature,
  AgentWidgetConfig,
  AgentWidgetMessage,
  AskUserQuestionOption,
  AskUserQuestionPayload,
  AskUserQuestionPrompt,
} from "../types";

export const ASK_USER_QUESTION_TOOL_NAME = "ask_user_question";
export const ASK_USER_QUESTION_MAX = 8;

const SHEET_SENTINEL = "data-persona-ask-sheet-for";
const DEFAULT_FREE_TEXT_LABEL_ROWS = "Other";
const DEFAULT_FREE_TEXT_LABEL_PILLS = "Other…";
const DEFAULT_FREE_TEXT_PLACEHOLDER = "Type your own answer here";
const DEFAULT_SUBMIT_LABEL = "Send";
const DEFAULT_NEXT_LABEL = "Next";
const DEFAULT_BACK_LABEL = "Back";
const DEFAULT_SUBMIT_ALL_LABEL = "Submit all";
const DEFAULT_SKIP_LABEL = "Skip";
const DEFAULT_SKELETON_PILLS = 3;

export const ATTR_CURRENT_INDEX = "data-ask-current-index";
export const ATTR_QUESTION_COUNT = "data-ask-question-count";
export const ATTR_ANSWERS = "data-ask-answers";
export const ATTR_GROUPED = "data-ask-grouped";
export const ATTR_LAYOUT = "data-ask-layout";

export type AskUserQuestionLayout = "rows" | "pills";

export const resolveLayout = (
  feature: AgentWidgetAskUserQuestionFeature
): AskUserQuestionLayout => (feature.layout === "pills" ? "pills" : "rows");

export const getLayout = (sheet: HTMLElement): AskUserQuestionLayout =>
  sheet.getAttribute(ATTR_LAYOUT) === "pills" ? "pills" : "rows";

let truncateWarned = false;

/**
 * Escape a tool-call id for safe use inside a CSS attribute selector.
 * `CSS.escape` would work but isn't available in all test environments (jsdom).
 */
const escapeAttrValue = (value: string): string => value.replace(/["\\]/g, "\\$&");

export const isAskUserQuestionMessage = (message: AgentWidgetMessage): boolean => {
  return (
    message.variant === "tool" &&
    !!message.toolCall &&
    message.toolCall.name === ASK_USER_QUESTION_TOOL_NAME
  );
};

const resolveFeature = (config?: AgentWidgetConfig): AgentWidgetAskUserQuestionFeature => {
  return config?.features?.askUserQuestion ?? {};
};

/**
 * Parse an `ask_user_question` tool-variant message into a partial payload.
 * Safe to call mid-stream — will walk the tool call's `chunks` via
 * `partial-json` and return `{ payload: null, complete: false }` when there
 * isn't enough data yet. `complete` flips to `true` once the tool call
 * reports status `"complete"`.
 *
 * Exported for plugin authors implementing `renderAskUserQuestion`.
 */
export const parseAskUserQuestionPayload = (
  message: AgentWidgetMessage
): { payload: Partial<AskUserQuestionPayload> | null; complete: boolean } => {
  const toolCall = message.toolCall;
  if (!toolCall) return { payload: null, complete: false };

  const complete = toolCall.status === "complete";

  if (toolCall.args && typeof toolCall.args === "object") {
    return { payload: toolCall.args as Partial<AskUserQuestionPayload>, complete };
  }

  const chunks = toolCall.chunks;
  if (!chunks || chunks.length === 0) return { payload: null, complete };

  try {
    const text = chunks.join("");
    const parsed = parsePartialJson(text, STR | OBJ | ARR);
    if (parsed && typeof parsed === "object") {
      return { payload: parsed as Partial<AskUserQuestionPayload>, complete };
    }
  } catch {
    // malformed; fall through
  }
  return { payload: null, complete };
};

/**
 * Return the questions array (capped to {@link ASK_USER_QUESTION_MAX}). Logs a
 * single one-shot warning if a payload exceeds the cap.
 */
export const promptsFromPayload = (
  payload: Partial<AskUserQuestionPayload> | null
): Partial<AskUserQuestionPrompt>[] => {
  const all = Array.isArray(payload?.questions) ? (payload!.questions as Partial<AskUserQuestionPrompt>[]) : [];
  if (all.length > ASK_USER_QUESTION_MAX && !truncateWarned) {
    truncateWarned = true;
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        `[AgentWidget] ask_user_question received ${all.length} questions; truncating to ${ASK_USER_QUESTION_MAX}.`
      );
    }
  }
  return all.slice(0, ASK_USER_QUESTION_MAX);
};

/**
 * Kept for plugin authors who only want to render the first question.
 * @deprecated Plugins should iterate `payload.questions` themselves; the
 * built-in renderer now paginates multi-question payloads.
 */
const firstPrompt = (
  payload: Partial<AskUserQuestionPayload> | null
): Partial<AskUserQuestionPrompt> | null => {
  return promptsFromPayload(payload)[0] ?? null;
};

const promptAt = (
  payload: Partial<AskUserQuestionPayload> | null,
  index: number
): Partial<AskUserQuestionPrompt> | null => {
  return promptsFromPayload(payload)[index] ?? null;
};

const applyStyleVars = (
  root: HTMLElement,
  feature: AgentWidgetAskUserQuestionFeature
): void => {
  const s = feature.styles;
  if (!s) return;
  if (s.sheetBackground) root.style.setProperty("--persona-ask-sheet-bg", s.sheetBackground);
  if (s.sheetBorder) root.style.setProperty("--persona-ask-sheet-border", s.sheetBorder);
  if (s.sheetShadow) root.style.setProperty("--persona-ask-sheet-shadow", s.sheetShadow);
  if (s.pillBackground) root.style.setProperty("--persona-ask-pill-bg", s.pillBackground);
  if (s.pillBackgroundSelected)
    root.style.setProperty("--persona-ask-pill-bg-selected", s.pillBackgroundSelected);
  if (s.pillTextColor) root.style.setProperty("--persona-ask-pill-fg", s.pillTextColor);
  if (s.pillTextColorSelected)
    root.style.setProperty("--persona-ask-pill-fg-selected", s.pillTextColorSelected);
  if (s.pillBorderRadius) root.style.setProperty("--persona-ask-pill-radius", s.pillBorderRadius);
  if (s.customInputBackground)
    root.style.setProperty("--persona-ask-input-bg", s.customInputBackground);
};

const buildAffordance = (
  layout: AskUserQuestionLayout,
  multiSelect: boolean,
  index: number
): HTMLElement | null => {
  if (layout !== "rows") return null;
  const wrap = createElement("span", "persona-ask-row-affordance");
  wrap.setAttribute("aria-hidden", "true");
  if (multiSelect) {
    const check = createElement("span", "persona-ask-row-check");
    wrap.appendChild(check);
  } else {
    const badge = createElement("span", "persona-ask-row-badge");
    badge.textContent = String(index + 1);
    wrap.appendChild(badge);
  }
  return wrap;
};

const buildPill = (
  option: AskUserQuestionOption,
  index: number,
  layout: AskUserQuestionLayout,
  multiSelect: boolean
): HTMLButtonElement => {
  const cls =
    layout === "rows"
      ? "persona-ask-pill persona-ask-row persona-pointer-events-auto"
      : "persona-ask-pill persona-pointer-events-auto";
  const btn = createElement("button", cls) as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("role", multiSelect ? "checkbox" : "button");
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("data-ask-user-action", "pick");
  btn.setAttribute("data-option-index", String(index));
  btn.setAttribute("data-option-label", option.label);

  if (layout === "rows") {
    const content = createElement("span", "persona-ask-row-content");
    const label = createElement("span", "persona-ask-row-label");
    label.textContent = option.label;
    content.appendChild(label);
    if (option.description) {
      const desc = createElement("span", "persona-ask-row-description");
      desc.textContent = option.description;
      content.appendChild(desc);
    }
    btn.appendChild(content);
    const aff = buildAffordance(layout, multiSelect, index);
    if (aff) btn.appendChild(aff);
  } else {
    btn.textContent = option.label;
    if (option.description) btn.title = option.description;
  }
  return btn;
};

const buildSkeletonPill = (layout: AskUserQuestionLayout): HTMLElement => {
  const cls =
    layout === "rows"
      ? "persona-ask-pill persona-ask-row persona-ask-pill-skeleton persona-pointer-events-none"
      : "persona-ask-pill persona-ask-pill-skeleton persona-pointer-events-none";
  const el = createElement("span", cls);
  el.setAttribute("aria-hidden", "true");
  return el;
};

/**
 * Build the interactive pill list + optional free-text pill for a given prompt.
 */
const buildPillList = (
  prompt: Partial<AskUserQuestionPrompt> | null,
  feature: AgentWidgetAskUserQuestionFeature,
  complete: boolean,
  layout: AskUserQuestionLayout
): HTMLElement => {
  const baseClass =
    layout === "rows"
      ? "persona-ask-pills persona-ask-pills--rows persona-flex persona-flex-col persona-gap-2"
      : "persona-ask-pills persona-flex persona-flex-wrap persona-gap-2";
  const list = createElement("div", baseClass);
  list.setAttribute("role", "group");
  list.setAttribute("data-ask-pill-list", "true");

  const multiSelect = !!prompt?.multiSelect;
  const realOptions = Array.isArray(prompt?.options) ? (prompt!.options as AskUserQuestionOption[]) : [];
  const cleanOptions = realOptions.filter((o) => o && typeof o.label === "string" && o.label.length > 0);

  if (cleanOptions.length === 0 && !complete) {
    for (let i = 0; i < DEFAULT_SKELETON_PILLS; i++) {
      list.appendChild(buildSkeletonPill(layout));
    }
    return list;
  }

  cleanOptions.forEach((option, index) => {
    list.appendChild(buildPill(option, index, layout, multiSelect));
  });

  // Free-text affordance:
  //   - Rows layout: a composite row that visually matches the option rows
  //     and HAS the input inside it (no separate row below). Number badge
  //     `N+1` on the right; pressing it focuses the input via the
  //     `focus-free-text` action.
  //   - Pills layout (legacy): a dashed pill button that expands a separate
  //     input row on click (handled by `buildFreeTextRow`).
  const allowFreeText = prompt?.allowFreeText !== false;
  if (allowFreeText) {
    const defaultLabel =
      layout === "rows" ? DEFAULT_FREE_TEXT_LABEL_ROWS : DEFAULT_FREE_TEXT_LABEL_PILLS;
    if (layout === "rows") {
      const otherRow = createElement(
        "div",
        "persona-ask-pill persona-ask-row persona-ask-row--other persona-ask-pill-custom persona-pointer-events-auto"
      );
      otherRow.setAttribute("data-ask-user-action", "focus-free-text");
      otherRow.setAttribute("data-option-index", String(cleanOptions.length));
      otherRow.setAttribute("data-ask-other-row", "true");

      const content = createElement("span", "persona-ask-row-content");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "persona-ask-row-input persona-flex-1 persona-pointer-events-auto";
      input.placeholder = feature.freeTextPlaceholder ?? DEFAULT_FREE_TEXT_PLACEHOLDER;
      input.setAttribute("data-ask-free-text-input", "true");
      input.setAttribute(
        "aria-label",
        feature.freeTextLabel ?? defaultLabel
      );
      content.appendChild(input);
      otherRow.appendChild(content);

      const aff = buildAffordance(layout, multiSelect, cleanOptions.length);
      if (aff) otherRow.appendChild(aff);
      list.appendChild(otherRow);
    } else {
      const freeBtn = createElement(
        "button",
        "persona-ask-pill persona-ask-pill-custom persona-pointer-events-auto"
      ) as HTMLButtonElement;
      freeBtn.type = "button";
      freeBtn.setAttribute("data-ask-user-action", "open-free-text");
      freeBtn.textContent = feature.freeTextLabel ?? defaultLabel;
      list.appendChild(freeBtn);
    }
  }

  return list;
};

const buildFreeTextRow = (
  feature: AgentWidgetAskUserQuestionFeature,
  layout: AskUserQuestionLayout
): HTMLElement => {
  const cls =
    layout === "rows"
      ? "persona-ask-free-text persona-ask-free-text--rows persona-flex persona-gap-2 persona-mt-2"
      : "persona-ask-free-text persona-hidden persona-flex persona-gap-2 persona-mt-2";
  const row = createElement("div", cls);
  row.setAttribute("data-ask-free-text-row", "true");

  const input = document.createElement("input");
  input.type = "text";
  input.className =
    "persona-ask-free-text-input persona-flex-1 persona-pointer-events-auto";
  input.placeholder = feature.freeTextPlaceholder ?? DEFAULT_FREE_TEXT_PLACEHOLDER;
  input.setAttribute("data-ask-free-text-input", "true");

  row.appendChild(input);

  // Pills (legacy) layout keeps the explicit Send button so the expand-on-click
  // affordance has a commit target. Rows layout drops it: the input commits via
  // Enter, or via the grouped Next/Submit-all flush path.
  if (layout !== "rows") {
    const submit = createElement(
      "button",
      "persona-ask-free-text-submit persona-pointer-events-auto"
    ) as HTMLButtonElement;
    submit.type = "button";
    submit.textContent = feature.submitLabel ?? DEFAULT_SUBMIT_LABEL;
    submit.setAttribute("data-ask-user-action", "submit-free-text");
    row.appendChild(submit);
  }

  return row;
};

const buildMultiSelectActions = (
  feature: AgentWidgetAskUserQuestionFeature
): HTMLElement => {
  const row = createElement(
    "div",
    "persona-ask-multi-actions persona-flex persona-justify-end persona-mt-2"
  );
  row.setAttribute("data-ask-multi-actions", "true");

  const submit = createElement(
    "button",
    "persona-ask-multi-submit persona-pointer-events-auto"
  ) as HTMLButtonElement;
  submit.type = "button";
  submit.textContent = feature.submitLabel ?? DEFAULT_SUBMIT_LABEL;
  submit.setAttribute("data-ask-user-action", "submit-multi");
  submit.disabled = true;

  row.appendChild(submit);
  return row;
};

const buildNavRow = (
  index: number,
  count: number,
  feature: AgentWidgetAskUserQuestionFeature
): HTMLElement => {
  const row = createElement(
    "div",
    "persona-ask-nav persona-flex persona-justify-between persona-items-center persona-gap-2 persona-mt-2"
  );
  row.setAttribute("data-ask-nav-row", "true");

  const back = createElement(
    "button",
    "persona-ask-nav-back persona-pointer-events-auto"
  ) as HTMLButtonElement;
  back.type = "button";
  back.textContent = feature.backLabel ?? DEFAULT_BACK_LABEL;
  back.setAttribute("data-ask-user-action", "back");
  back.disabled = index === 0;
  row.appendChild(back);

  const rightGroup = createElement(
    "div",
    "persona-ask-nav-right persona-flex persona-items-center persona-gap-2"
  );

  const skip = createElement(
    "button",
    "persona-ask-nav-skip persona-pointer-events-auto"
  ) as HTMLButtonElement;
  skip.type = "button";
  skip.textContent = feature.skipLabel ?? DEFAULT_SKIP_LABEL;
  skip.setAttribute("data-ask-user-action", "skip");
  rightGroup.appendChild(skip);

  const next = createElement(
    "button",
    "persona-ask-nav-next persona-pointer-events-auto"
  ) as HTMLButtonElement;
  next.type = "button";
  const isFinal = index === count - 1;
  next.textContent = isFinal
    ? feature.submitAllLabel ?? DEFAULT_SUBMIT_ALL_LABEL
    : feature.nextLabel ?? DEFAULT_NEXT_LABEL;
  next.setAttribute("data-ask-user-action", isFinal ? "submit-all" : "next");
  next.disabled = true; // updated by syncNavState
  rightGroup.appendChild(next);

  row.appendChild(rightGroup);

  return row;
};

/**
 * Read the answers map stored on the sheet element.
 */
export const readAnswersFromSheet = (
  sheet: HTMLElement
): Record<number, string | string[]> => {
  const raw = sheet.getAttribute(ATTR_ANSWERS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<number, string | string[]>) : {};
  } catch {
    return {};
  }
};

/**
 * Write the answers map back to the sheet element.
 */
export const writeAnswersToSheet = (
  sheet: HTMLElement,
  answers: Record<number, string | string[]>
): void => {
  sheet.setAttribute(ATTR_ANSWERS, JSON.stringify(answers));
};

export const getCurrentIndex = (sheet: HTMLElement): number => {
  const raw = Number(sheet.getAttribute(ATTR_CURRENT_INDEX) ?? "0");
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
};

export const setCurrentIndex = (sheet: HTMLElement, index: number): void => {
  sheet.setAttribute(ATTR_CURRENT_INDEX, String(Math.max(0, Math.floor(index))));
};

export const getQuestionCount = (sheet: HTMLElement): number => {
  const raw = Number(sheet.getAttribute(ATTR_QUESTION_COUNT) ?? "1");
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
};

export const isGroupedSheet = (sheet: HTMLElement): boolean => {
  return sheet.getAttribute(ATTR_GROUPED) === "true";
};

const restoreAnswersFromMessage = (
  message: AgentWidgetMessage,
  prompts: Partial<AskUserQuestionPrompt>[]
): Record<number, string | string[]> => {
  const stored = message.agentMetadata?.askUserQuestionAnswers;
  if (!stored || typeof stored !== "object") return {};
  const result: Record<number, string | string[]> = {};
  prompts.forEach((p, i) => {
    const q = typeof p?.question === "string" ? p.question : "";
    if (q && Object.prototype.hasOwnProperty.call(stored, q)) {
      const v = stored[q];
      if (typeof v === "string" || Array.isArray(v)) {
        result[i] = v;
      }
    }
  });
  return result;
};

const restoreIndexFromMessage = (
  message: AgentWidgetMessage,
  count: number
): number => {
  const stored = message.agentMetadata?.askUserQuestionIndex;
  if (typeof stored !== "number" || !Number.isFinite(stored)) return 0;
  return Math.max(0, Math.min(count - 1, Math.floor(stored)));
};

/**
 * Keyed-by-question-text view of the current answers on a sheet. Used both for
 * persistence to message metadata and for the final tool-result payload sent
 * back to the agent.
 */
export const buildStructuredAnswers = (
  sheet: HTMLElement,
  message: AgentWidgetMessage
): Record<string, string | string[]> => {
  const { payload } = parseAskUserQuestionPayload(message);
  const prompts = promptsFromPayload(payload);
  const indexed = readAnswersFromSheet(sheet);
  const result: Record<string, string | string[]> = {};
  const seen = new Set<string>();
  prompts.forEach((p, i) => {
    const q = typeof p?.question === "string" ? p.question : "";
    if (!q) return;
    if (seen.has(q) && typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(`[AgentWidget] ask_user_question has duplicate question text "${q}"; later answer wins.`);
    }
    seen.add(q);
    if (Object.prototype.hasOwnProperty.call(indexed, i)) {
      result[q] = indexed[i];
    }
  });
  return result;
};

/**
 * Apply the selected/unselected visual state to pills on the current page,
 * based on the answer stored for `currentIndex`.
 */
const applySelectionState = (sheet: HTMLElement): void => {
  const answers = readAnswersFromSheet(sheet);
  const currentIndex = getCurrentIndex(sheet);
  const stored = answers[currentIndex];
  const selected = new Set<string>();
  if (typeof stored === "string") selected.add(stored);
  else if (Array.isArray(stored)) stored.forEach((s) => selected.add(s));

  const pills = sheet.querySelectorAll<HTMLButtonElement>('[data-ask-user-action="pick"][data-option-label]');
  pills.forEach((pill) => {
    const label = pill.getAttribute("data-option-label") ?? "";
    const on = selected.has(label);
    pill.setAttribute("aria-pressed", on ? "true" : "false");
    pill.classList.toggle("persona-ask-pill-selected", on);
  });

  // Also pre-fill the free-text input if the saved answer doesn't match any pill.
  const realPillLabels = new Set(
    Array.from(pills).map((p) => p.getAttribute("data-option-label") ?? "")
  );
  // In rows mode the input lives inside the Other row of the pill list; in
  // pills mode it lives in a separate (potentially hidden) free-text row.
  // Querying the input directly covers both layouts.
  const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
  if (freeInput) {
    if (typeof stored === "string" && stored.length > 0 && !realPillLabels.has(stored)) {
      freeInput.value = stored;
      const freeRow = freeInput.closest<HTMLElement>('[data-ask-free-text-row="true"]');
      freeRow?.classList.remove("persona-hidden");
    } else {
      freeInput.value = "";
    }
  }
};

/**
 * Update the Next/Submit-all enabled state based on whether the current
 * question has a non-empty answer stored.
 */
const syncNavState = (sheet: HTMLElement): void => {
  if (!isGroupedSheet(sheet)) return;
  const answers = readAnswersFromSheet(sheet);
  const currentIndex = getCurrentIndex(sheet);
  const v = answers[currentIndex];
  const hasAnswer =
    (typeof v === "string" && v.length > 0) || (Array.isArray(v) && v.length > 0);
  const next = sheet.querySelector<HTMLButtonElement>(
    '[data-ask-user-action="next"], [data-ask-user-action="submit-all"]'
  );
  if (next) next.disabled = !hasAnswer;

  // Multi-select submit (1-question mode) — keep existing behavior.
  const multi = sheet.querySelector<HTMLButtonElement>('[data-ask-user-action="submit-multi"]');
  if (multi) {
    const labels = Array.from(
      sheet.querySelectorAll<HTMLElement>('[aria-pressed="true"][data-option-label]')
    );
    multi.disabled = labels.length === 0;
  }
};

/**
 * Replace the page-scoped body of the sheet (question text, pills, free-text
 * row, multi-select actions) with content for `currentIndex`. Called both on
 * initial mount and after every Back/Next navigation. Preserves the stepper
 * row, the dismiss button, and the nav row at the bottom.
 */
const renderCurrentPage = (
  sheet: HTMLElement,
  message: AgentWidgetMessage,
  config: AgentWidgetConfig | undefined
): void => {
  const feature = resolveFeature(config);
  const layout = getLayout(sheet);
  const { payload, complete } = parseAskUserQuestionPayload(message);
  const grouped = isGroupedSheet(sheet);
  const index = getCurrentIndex(sheet);
  const count = getQuestionCount(sheet);
  const prompt = grouped ? promptAt(payload, index) : firstPrompt(payload);
  const multiSelect = !!prompt?.multiSelect;

  // Inline stepper "{index+1}/{count}" lives in the header next to the
  // question text. Empty in single-Q mode.
  const stepInline = sheet.querySelector<HTMLElement>('[data-ask-step-inline="true"]');
  if (stepInline) {
    stepInline.textContent = grouped ? `${index + 1}/${count}` : "";
  }
  // Sweep any legacy stepper row from earlier renders.
  const oldStepper = sheet.querySelector<HTMLElement>('[data-ask-stepper="true"]');
  if (oldStepper) oldStepper.remove();

  // Question text
  const qText = sheet.querySelector<HTMLElement>('[data-ask-question="true"]');
  if (qText) {
    const text = typeof prompt?.question === "string" ? prompt.question : "";
    qText.textContent = text;
    qText.classList.toggle("persona-ask-question-skeleton", !text && !complete);
  }

  // Pills list
  const pillList = sheet.querySelector<HTMLElement>('[data-ask-pill-list="true"]');
  if (pillList) {
    const fresh = buildPillList(prompt, feature, complete, layout);
    pillList.replaceWith(fresh);
  }

  // Free-text row — re-build to clear stale input value across pages.
  // Only present in pills (legacy) mode; in rows mode the input lives inside
  // the Other row of the pill list, which is rebuilt above.
  if (layout !== "rows") {
    const oldFree = sheet.querySelector<HTMLElement>('[data-ask-free-text-row="true"]');
    if (oldFree) oldFree.replaceWith(buildFreeTextRow(feature, layout));
  }

  // Multi-select action row — only relevant in 1-question mode.
  const oldMulti = sheet.querySelector<HTMLElement>('[data-ask-multi-actions="true"]');
  if (!grouped && multiSelect && !oldMulti) {
    sheet.appendChild(buildMultiSelectActions(feature));
  } else if ((!multiSelect || grouped) && oldMulti) {
    oldMulti.remove();
  }
  sheet.setAttribute("data-multi-select", multiSelect ? "true" : "false");

  // Nav row stays last; only present in grouped mode.
  const oldNav = sheet.querySelector<HTMLElement>('[data-ask-nav-row="true"]');
  if (grouped) {
    const fresh = buildNavRow(index, count, feature);
    if (oldNav) oldNav.replaceWith(fresh);
    else sheet.appendChild(fresh);
  } else if (oldNav) {
    oldNav.remove();
  }

  applySelectionState(sheet);
  syncNavState(sheet);
};

const buildSheet = (
  message: AgentWidgetMessage,
  config: AgentWidgetConfig | undefined,
  payload: Partial<AskUserQuestionPayload> | null
): HTMLElement => {
  const feature = resolveFeature(config);
  const layout = resolveLayout(feature);
  const toolCallId = message.toolCall!.id;
  const prompts = promptsFromPayload(payload);
  const count = Math.max(1, prompts.length);
  const grouped = count > 1;

  const initialAnswers = restoreAnswersFromMessage(message, prompts);
  const initialIndex = grouped ? restoreIndexFromMessage(message, count) : 0;

  const sheet = createElement(
    "div",
    [
      "persona-ask-sheet",
      `persona-ask-sheet--${layout}`,
      "persona-pointer-events-auto",
      "persona-ask-sheet-enter",
    ].join(" ")
  );
  sheet.setAttribute(SHEET_SENTINEL, toolCallId);
  sheet.setAttribute("data-tool-call-id", toolCallId);
  sheet.setAttribute("data-message-id", message.id);
  sheet.setAttribute(ATTR_QUESTION_COUNT, String(count));
  sheet.setAttribute(ATTR_CURRENT_INDEX, String(initialIndex));
  sheet.setAttribute(ATTR_GROUPED, grouped ? "true" : "false");
  sheet.setAttribute(ATTR_LAYOUT, layout);
  writeAnswersToSheet(sheet, initialAnswers);
  sheet.setAttribute("role", "group");
  sheet.setAttribute("aria-label", "Suggested answers");

  if (feature.slideInMs !== undefined) {
    sheet.style.setProperty("--persona-ask-sheet-duration", `${feature.slideInMs}ms`);
  }
  applyStyleVars(sheet, feature);

  // Header: question text (flex-1) + compact "N/M" stepper indicator on the
  // right (grouped only). Skip in the nav row is the canonical escape hatch
  // — plugins that want a different escape model render their own UX.
  const header = createElement(
    "div",
    "persona-ask-sheet-header persona-flex persona-items-center persona-gap-3"
  );

  const qText = createElement("div", "persona-ask-sheet-question persona-flex-1");
  qText.setAttribute("data-ask-question", "true");
  qText.textContent = "";
  header.appendChild(qText);

  // Inline stepper indicator. Empty for single-Q; populated by
  // renderCurrentPage to "{index+1}/{count}" in grouped mode.
  const stepInline = createElement(
    "span",
    "persona-ask-sheet-step-inline"
  );
  stepInline.setAttribute("data-ask-step-inline", "true");
  stepInline.textContent = "";
  header.appendChild(stepInline);

  sheet.appendChild(header);

  // Skeleton placeholders — these get replaced wholesale by renderCurrentPage.
  const skeletonClass =
    layout === "rows"
      ? "persona-ask-pills persona-ask-pills--rows persona-flex persona-flex-col persona-gap-2"
      : "persona-ask-pills persona-flex persona-flex-wrap persona-gap-2";
  const list = createElement("div", skeletonClass);
  list.setAttribute("data-ask-pill-list", "true");
  list.setAttribute("role", "group");
  sheet.appendChild(list);

  // Pills (legacy) layout uses a separate, hidden free-text row that expands
  // on click. Rows layout embeds the input inside the Other row of the pill
  // list, so the standalone row is unnecessary.
  if (layout !== "rows") {
    sheet.appendChild(buildFreeTextRow(feature, layout));
  }

  // Render the actual current page (stepper, pills, multi-actions, nav).
  renderCurrentPage(sheet, message, config);

  // Remove the enter class next frame so the slide-in transition runs.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => sheet.classList.remove("persona-ask-sheet-enter"));
  });

  return sheet;
};

const syncSheetFromMessage = (
  sheet: HTMLElement,
  message: AgentWidgetMessage,
  config: AgentWidgetConfig | undefined
): void => {
  // If the payload's question count grew (rare mid-stream), update the cached count.
  const { payload } = parseAskUserQuestionPayload(message);
  const newCount = Math.max(1, promptsFromPayload(payload).length);
  if (newCount > getQuestionCount(sheet)) {
    sheet.setAttribute(ATTR_QUESTION_COUNT, String(newCount));
    if (newCount > 1 && !isGroupedSheet(sheet)) {
      sheet.setAttribute(ATTR_GROUPED, "true");
    }
  }
  renderCurrentPage(sheet, message, config);
};

/**
 * Create the small in-transcript stub for an `ask_user_question` tool call.
 * The stub is passive — the interactive sheet is mounted separately into
 * the composer overlay via `ensureAskUserQuestionSheet`.
 */
export const createAskUserQuestionBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig
): HTMLElement => {
  const bubble = createElement(
    "div",
    "persona-ask-stub persona-inline-flex persona-items-center persona-gap-2"
  );
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);
  bubble.setAttribute("data-bubble-type", "ask-user-question");

  const feature = resolveFeature(config);
  applyStyleVars(bubble, feature);

  const text = createElement("span", "persona-ask-stub-label");
  const { complete } = parseAskUserQuestionPayload(message);
  text.textContent = complete ? "Awaiting your response…" : "Preparing options…";
  bubble.appendChild(text);

  return bubble;
};

/**
 * Mount or update the interactive answer-pill sheet for a given message.
 * Idempotent — if a sheet already exists for the tool-call id, it is hydrated
 * in-place instead of remounted, so streaming updates don't flicker.
 */
export const ensureAskUserQuestionSheet = (
  message: AgentWidgetMessage,
  config: AgentWidgetConfig | undefined,
  overlay: HTMLElement | null | undefined
): void => {
  if (!overlay) return;
  if (!isAskUserQuestionMessage(message)) return;

  const feature = resolveFeature(config);
  if (feature.enabled === false) return;

  const toolCallId = message.toolCall!.id;

  // Only keep the latest sheet in the overlay — clear any stale siblings.
  const siblings = overlay.querySelectorAll<HTMLElement>(`[${SHEET_SENTINEL}]`);
  siblings.forEach((el) => {
    if (el.getAttribute(SHEET_SENTINEL) !== toolCallId) {
      el.remove();
    }
  });

  const existing = overlay.querySelector<HTMLElement>(
    `[${SHEET_SENTINEL}="${escapeAttrValue(toolCallId)}"]`
  );
  if (existing) {
    syncSheetFromMessage(existing, message, config);
    return;
  }

  const { payload } = parseAskUserQuestionPayload(message);
  const sheet = buildSheet(message, config, payload);
  overlay.appendChild(sheet);
};

/**
 * Remove the sheet for a specific tool-call id, or all sheets if omitted.
 * Runs a slide-out transition before removing.
 */
export const removeAskUserQuestionSheet = (
  overlay: HTMLElement | null | undefined,
  toolCallId?: string
): void => {
  if (!overlay) return;

  const selector = toolCallId
    ? `[${SHEET_SENTINEL}="${escapeAttrValue(toolCallId)}"]`
    : `[${SHEET_SENTINEL}]`;
  const sheets = overlay.querySelectorAll<HTMLElement>(selector);

  sheets.forEach((sheet) => {
    sheet.classList.add("persona-ask-sheet-leave");
    const duration = Number.parseInt(
      getComputedStyle(sheet).getPropertyValue("--persona-ask-sheet-duration") || "180",
      10
    );
    const remove = () => sheet.remove();
    setTimeout(remove, Number.isFinite(duration) ? duration : 180);
  });
};

/**
 * Read the currently-selected option labels from a multi-select sheet.
 */
export const getSelectedLabels = (sheet: HTMLElement): string[] => {
  return Array.from(
    sheet.querySelectorAll<HTMLElement>('[aria-pressed="true"][data-option-label]')
  )
    .map((el) => el.getAttribute("data-option-label"))
    .filter((label): label is string => typeof label === "string" && label.length > 0);
};

/**
 * Update the answer for the current page and refresh visual state. Used by
 * the ui.ts event handlers in grouped mode.
 */
export const setCurrentAnswer = (
  sheet: HTMLElement,
  answer: string | string[]
): void => {
  const answers = readAnswersFromSheet(sheet);
  const idx = getCurrentIndex(sheet);
  if (typeof answer === "string" && answer.length === 0) {
    delete answers[idx];
  } else if (Array.isArray(answer) && answer.length === 0) {
    delete answers[idx];
  } else {
    answers[idx] = answer;
  }
  writeAnswersToSheet(sheet, answers);
  applySelectionState(sheet);
  syncNavState(sheet);
};

/**
 * Navigate to a page by index and re-render the current page contents.
 */
export const navigateToPage = (
  sheet: HTMLElement,
  message: AgentWidgetMessage,
  config: AgentWidgetConfig | undefined,
  index: number
): void => {
  const count = getQuestionCount(sheet);
  const clamped = Math.max(0, Math.min(count - 1, index));
  setCurrentIndex(sheet, clamped);
  renderCurrentPage(sheet, message, config);
};

/**
 * Re-export of the post-render nav-state sync, for ui.ts to call after pill
 * toggles in grouped multi-select mode.
 */
export const refreshNavState = (sheet: HTMLElement): void => {
  syncNavState(sheet);
};

/**
 * Test seam — reset the one-shot truncation warning so each test can assert
 * the warn fires exactly once.
 */
export const __resetTruncateWarn = (): void => {
  truncateWarned = false;
};
