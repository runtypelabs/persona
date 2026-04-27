// Example plugin: renders the `ask_user_question` answer sheet as a horizontal
// wrap of pill buttons with an optional free-text pill that expands into an
// inline input + Send button.
//
// Demonstrates the `renderAskUserQuestion` plugin hook. Register via:
//   plugins: [horizontalPillsAskPlugin]
//
// Supports grouped (multi-question) payloads with an internal stepper: shows
// "Question N of M", auto-advances on single-select pick, and submits a
// structured `{ [questionText]: answer }` payload on the final page —
// matching the schema the agent receives back. Set the payload's `multiSelect`
// per-question to allow multi-pick (Next button replaces auto-advance).
//
// Once the user answers, the widget suppresses the original tool message
// entirely from the transcript and injects assistant/user bubble pairs
// (one per question + one per answer; skipped questions become an italic
// `*Skipped*` user bubble) so the transcript reads as a normal conversation.
// Plugins do NOT render the answered state — only the interactive sheet.
//
// Copy this file into your own app; it has zero dependencies beyond the
// widget plugin contract.

const STYLE_ID = "ask-pill-plugin-style";

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ask-pill-sheet {
      background: var(--persona-surface, #ffffff);
      border: 1px solid var(--persona-border, #e5e7eb);
      border-radius: 1rem;
      padding: 0.85rem 1rem;
      margin: 0.5rem 0;
      box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }
    .ask-pill-header {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.6rem;
    }
    .ask-pill-question {
      flex: 1;
      font-size: 0.95rem;
      color: var(--persona-text, #1f2937);
    }
    .ask-pill-stepper {
      align-self: center;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--persona-muted, #6b7280);
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--persona-container, #f3f4f6);
      white-space: nowrap;
    }
    .ask-pill-close {
      width: 1.6rem;
      height: 1.6rem;
      border: none;
      background: transparent;
      color: var(--persona-muted, #6b7280);
      cursor: pointer;
      border-radius: 0.4rem;
      font-size: 1rem;
      line-height: 1;
      padding: 0;
    }
    .ask-pill-close:hover { background: var(--persona-container, #f3f4f6); }
    .ask-pill-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .ask-pill-option, .ask-pill-free-btn {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 0.95rem;
      border-radius: 999px;
      border: 1px solid var(--persona-border, #e5e7eb);
      background: transparent;
      color: var(--persona-text, #1f2937);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
    }
    .ask-pill-option:hover, .ask-pill-free-btn:hover {
      border-color: var(--persona-text, #1f2937);
      background: var(--persona-container, #f3f4f6);
    }
    .ask-pill-option:active, .ask-pill-free-btn:active { transform: translateY(1px); }
    .ask-pill-option[aria-pressed="true"] {
      background: var(--persona-accent, #7c3aed);
      border-color: var(--persona-accent, #7c3aed);
      color: #fafafa;
    }
    .ask-pill-free-btn { border-style: dashed; }
    .ask-pill-free-row {
      display: none;
      gap: 0.5rem;
      margin-top: 0.6rem;
    }
    .ask-pill-free-row[data-open="true"] { display: flex; }
    .ask-pill-input {
      flex: 1;
      padding: 0.5rem 0.8rem;
      border: 1px solid var(--persona-border, #e5e7eb);
      border-radius: 0.55rem;
      font-size: 0.88rem;
      background: var(--persona-surface, #ffffff);
      color: var(--persona-text, #1f2937);
    }
    .ask-pill-input:focus {
      outline: 2px solid var(--persona-accent, #7c3aed);
      outline-offset: 1px;
    }
    .ask-pill-send {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.55rem;
      background: var(--persona-accent, #7c3aed);
      color: #fafafa;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .ask-pill-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .ask-pill-footer {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.7rem;
      align-items: center;
      justify-content: flex-end;
    }
    .ask-pill-footer .ask-pill-stepper {
      margin-left: auto;
    }
    .ask-pill-nav {
      padding: 0.45rem 0.9rem;
      border: 1px solid var(--persona-border, #e5e7eb);
      border-radius: 0.55rem;
      background: transparent;
      color: var(--persona-text, #1f2937);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
    }
    .ask-pill-nav:hover { background: var(--persona-container, #f3f4f6); }
    .ask-pill-nav:disabled { opacity: 0.4; cursor: not-allowed; }
    .ask-pill-nav.ask-pill-nav-primary {
      background: var(--persona-accent, #7c3aed);
      border-color: var(--persona-accent, #7c3aed);
      color: #fafafa;
    }
    .ask-pill-nav.ask-pill-nav-primary:hover {
      background: var(--persona-accent, #7c3aed);
      filter: brightness(0.95);
    }
  `;
  document.head.appendChild(style);
};

// IMPORTANT — event-delegation pattern.
//
// The widget re-renders messages by morphing DOM via idiomorph. To stay
// robust, this plugin attaches a SINGLE delegated click/keydown handler at
// the root element and dispatches by `data-action` attribute. All cross-
// render state lives in `data-*` attributes on the root (current question
// index, accumulated answers JSON), not in closure refs — so re-renders
// reading from `e.currentTarget` see the live state.
//
// Plugin authors writing their own `renderAskUserQuestion` should follow the
// same pattern: one delegated listener at the root, identify targets via
// `data-*` attributes on children, persist state on the root element.

const ATTR_CURRENT = "data-ask-current-index";
const ATTR_COUNT = "data-ask-question-count";
const ATTR_ANSWERS = "data-ask-answers";

const readAnswers = (root) => {
  try {
    return JSON.parse(root.getAttribute(ATTR_ANSWERS) || "{}");
  } catch {
    return {};
  }
};

const writeAnswers = (root, answers) => {
  root.setAttribute(ATTR_ANSWERS, JSON.stringify(answers));
};

const getCurrentPrompt = (questions, root) => {
  const idx = Number(root.getAttribute(ATTR_CURRENT) || 0);
  return { idx, prompt: questions[idx] };
};

const renderBody = (root, questions) => {
  const total = questions.length;
  const { idx, prompt } = getCurrentPrompt(questions, root);
  if (!prompt) return;
  const answers = readAnswers(root);
  const currentAnswer = answers[prompt.question];
  const isMulti = prompt.multiSelect === true;
  const allowFreeText = prompt.allowFreeText !== false;

  const header = document.createElement("div");
  header.className = "ask-pill-header";

  const q = document.createElement("div");
  q.className = "ask-pill-question";
  q.textContent = prompt.question ?? "";
  header.appendChild(q);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "ask-pill-close";
  close.setAttribute("aria-label", "Dismiss");
  close.setAttribute("data-action", "dismiss");
  close.textContent = "×";
  header.appendChild(close);

  const list = document.createElement("div");
  list.className = "ask-pill-list";

  const options = Array.isArray(prompt.options) ? prompt.options : [];
  options.forEach((option) => {
    if (!option || typeof option.label !== "string") return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ask-pill-option";
    btn.textContent = option.label;
    btn.setAttribute("data-action", "pick");
    btn.setAttribute("data-label", option.label);
    if (option.description) btn.title = option.description;

    const isSelected = isMulti
      ? Array.isArray(currentAnswer) && currentAnswer.includes(option.label)
      : currentAnswer === option.label;
    if (isSelected) btn.setAttribute("aria-pressed", "true");

    list.appendChild(btn);
  });

  if (allowFreeText) {
    const freeBtn = document.createElement("button");
    freeBtn.type = "button";
    freeBtn.className = "ask-pill-free-btn";
    freeBtn.textContent = "Other…";
    freeBtn.setAttribute("data-action", "open-free");
    list.appendChild(freeBtn);
  }

  let freeRow = null;
  if (allowFreeText) {
    freeRow = document.createElement("div");
    freeRow.className = "ask-pill-free-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ask-pill-input";
    input.placeholder = prompt.freeTextPlaceholder ?? "Type your answer…";
    input.setAttribute("data-role", "free-input");

    const send = document.createElement("button");
    send.type = "button";
    send.className = "ask-pill-send";
    send.textContent = "Send";
    send.disabled = true;
    send.setAttribute("data-action", "submit-free");

    freeRow.append(input, send);
  }

  // Footer with Back / Next / Submit-all. Shown when grouped, when the
  // current page is multi-select, or when auto-advance is disabled (so the
  // user has an explicit Next button on every grouped page).
  let footer = null;
  const isLast = idx === total - 1;
  const autoAdvance = root.getAttribute("data-ask-auto-advance") !== "false";
  const showFooter = total > 1 || isMulti;
  if (showFooter) {
    footer = document.createElement("div");
    footer.className = "ask-pill-footer";

    if (idx > 0) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "ask-pill-nav";
      back.textContent = "Back";
      back.setAttribute("data-action", "back");
      footer.appendChild(back);
    }

    // Show an advance button when:
    //   - this page is multi-select (pick toggles, doesn't advance), or
    //   - this is the last page (always needs explicit Submit-all), or
    //   - auto-advance is disabled (every grouped page needs a Next).
    const needsAdvanceButton = isMulti || isLast || (!autoAdvance && total > 1);
    if (needsAdvanceButton) {
      const next = document.createElement("button");
      next.type = "button";
      next.className = "ask-pill-nav ask-pill-nav-primary";
      next.textContent = isLast ? "Submit all" : "Next";
      next.setAttribute("data-action", isLast ? "submit-all" : "next");
      const hasAnswer = isMulti
        ? Array.isArray(currentAnswer) && currentAnswer.length > 0
        : currentAnswer != null && currentAnswer !== "";
      // For the last page in single-Q mode (total === 1), the user picks a
      // pill which auto-resolves — Submit-all only matters when grouped.
      if (total > 1 || isMulti) next.disabled = !hasAnswer;
      footer.appendChild(next);
    }

    if (total > 1) {
      const stepper = document.createElement("span");
      stepper.className = "ask-pill-stepper";
      stepper.textContent = `Question ${idx + 1} of ${total}`;
      footer.appendChild(stepper);
    }
  }

  const children = [header, list];
  if (freeRow) children.push(freeRow);
  if (footer) children.push(footer);
  root.replaceChildren(...children);
};

const buildStructuredAnswer = (questions, answers) => {
  const out = {};
  questions.forEach((p) => {
    if (!p?.question) return;
    const v = answers[p.question];
    if (v == null) return;
    out[p.question] = v;
  });
  return out;
};

export const horizontalPillsAskPlugin = {
  id: "example-horizontal-pills",

  renderAskUserQuestion: ({ message, payload, complete, resolve, dismiss, config }) => {
    ensureStyle();

    // Answered state is handled entirely by the widget — the original tool
    // message is suppressed from transcript and Q→A pair bubbles are injected
    // in its place. Plugins only render the interactive sheet.
    if (message?.agentMetadata?.askUserQuestionAnswered === true) {
      return null;
    }

    const questions = Array.isArray(payload?.questions) ? payload.questions : [];
    if (questions.length === 0 || !complete) return null;

    // Respect the same `groupedAutoAdvance` config flag the built-in renderer
    // uses. Default true: a single-select pick on an intermediate page jumps
    // forward immediately. When false, every grouped page needs an explicit
    // Next click so the user can review their choice before moving on.
    const autoAdvance = config?.features?.askUserQuestion?.groupedAutoAdvance !== false;

    const root = document.createElement("div");
    root.className = "ask-pill-sheet";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Suggested answers");
    root.setAttribute(ATTR_CURRENT, "0");
    root.setAttribute(ATTR_COUNT, String(questions.length));
    root.setAttribute(ATTR_ANSWERS, "{}");
    root.setAttribute("data-ask-auto-advance", autoAdvance ? "true" : "false");

    renderBody(root, questions);

    // Single delegated listener — survives morph passes. Always read state
    // from `e.currentTarget` (the live root) rather than captured refs.
    root.addEventListener("click", (e) => {
      const liveRoot = e.currentTarget;
      const target = e.target instanceof Element ? e.target.closest("[data-action]") : null;
      if (!target) return;
      const action = target.getAttribute("data-action");

      const idx = Number(liveRoot.getAttribute(ATTR_CURRENT) || 0);
      const total = Number(liveRoot.getAttribute(ATTR_COUNT) || 1);
      const prompt = questions[idx];
      if (!prompt) return;
      const isMulti = prompt.multiSelect === true;

      if (action === "dismiss") {
        dismiss();
        return;
      }

      if (action === "pick") {
        const label = target.getAttribute("data-label");
        if (!label) return;
        const answers = readAnswers(liveRoot);
        if (isMulti) {
          const current = Array.isArray(answers[prompt.question]) ? answers[prompt.question] : [];
          const next = current.includes(label)
            ? current.filter((v) => v !== label)
            : [...current, label];
          answers[prompt.question] = next;
          writeAnswers(liveRoot, answers);
          renderBody(liveRoot, questions);
          return;
        }
        // Single-select. Single-question payloads resolve as a plain string
        // (matching the simple case the agent expects). Grouped payloads
        // accumulate, then submit a structured object on the last page.
        if (total === 1) {
          resolve(label);
          return;
        }
        answers[prompt.question] = label;
        writeAnswers(liveRoot, answers);
        // Auto-advance only when (a) the flag is on, and (b) we're not on
        // the final page (which always requires explicit Submit-all so the
        // user can review every answer before committing).
        if (autoAdvance && idx < total - 1) {
          liveRoot.setAttribute(ATTR_CURRENT, String(idx + 1));
        }
        renderBody(liveRoot, questions);
        return;
      }

      if (action === "open-free") {
        const row = liveRoot.querySelector(".ask-pill-free-row");
        if (row) row.setAttribute("data-open", "true");
        target.style.display = "none";
        const liveInput = liveRoot.querySelector('[data-role="free-input"]');
        setTimeout(() => liveInput?.focus(), 0);
        return;
      }

      if (action === "submit-free") {
        const liveInput = liveRoot.querySelector('[data-role="free-input"]');
        const value = liveInput?.value.trim() ?? "";
        if (!value) return;
        if (total === 1) {
          resolve(value);
          return;
        }
        const answers = readAnswers(liveRoot);
        answers[prompt.question] = value;
        writeAnswers(liveRoot, answers);
        if (idx < total - 1) {
          liveRoot.setAttribute(ATTR_CURRENT, String(idx + 1));
          renderBody(liveRoot, questions);
        } else {
          resolve(buildStructuredAnswer(questions, answers));
        }
        return;
      }

      if (action === "next") {
        if (idx < total - 1) {
          liveRoot.setAttribute(ATTR_CURRENT, String(idx + 1));
          renderBody(liveRoot, questions);
        }
        return;
      }

      if (action === "back") {
        if (idx > 0) {
          liveRoot.setAttribute(ATTR_CURRENT, String(idx - 1));
          renderBody(liveRoot, questions);
        }
        return;
      }

      if (action === "submit-all") {
        const answers = readAnswers(liveRoot);
        if (total === 1) {
          // Edge case: shouldn't happen since single-Q resolves on pick, but
          // guard anyway.
          const v = answers[prompt.question];
          if (v != null) resolve(typeof v === "string" ? v : v);
          return;
        }
        resolve(buildStructuredAnswer(questions, answers));
        return;
      }
    });

    root.addEventListener("input", (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      if (e.target.getAttribute("data-role") !== "free-input") return;
      const liveSend = e.currentTarget.querySelector('[data-action="submit-free"]');
      if (liveSend) liveSend.disabled = e.target.value.trim().length === 0;
    });

    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (!(e.target instanceof HTMLInputElement)) return;
      if (e.target.getAttribute("data-role") !== "free-input") return;
      e.preventDefault();
      const liveRoot = e.currentTarget;
      const value = e.target.value.trim();
      if (!value) return;
      const idx = Number(liveRoot.getAttribute(ATTR_CURRENT) || 0);
      const total = Number(liveRoot.getAttribute(ATTR_COUNT) || 1);
      const prompt = questions[idx];
      if (!prompt) return;
      if (total === 1) {
        resolve(value);
        return;
      }
      const answers = readAnswers(liveRoot);
      answers[prompt.question] = value;
      writeAnswers(liveRoot, answers);
      if (idx < total - 1) {
        liveRoot.setAttribute(ATTR_CURRENT, String(idx + 1));
        renderBody(liveRoot, questions);
      } else {
        resolve(buildStructuredAnswer(questions, answers));
      }
    });

    return root;
  },
};
