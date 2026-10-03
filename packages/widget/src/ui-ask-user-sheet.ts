/**
 * Event handlers for the `ask_user_question` answer sheet that mounts in the
 * composer overlay: pill pick (single), multi-select toggle + submit, free-text
 * expansion + submit, grouped-question paging, skip, and dismissal. A selection
 * becomes a regular user message (or a LOCAL-tool resume) so the agent
 * continues on the next turn.
 *
 * Lives in the lazy `ui-extras` chunk: `ui.ts` warms it when a sheet mounts
 * and routes overlay events here once loaded.
 */
import type { AgentWidgetConfig } from "./types";
import type { AgentWidgetSession } from "./session";
import {
  buildStructuredAnswers,
  getCurrentIndex,
  getQuestionCount,
  getSelectedLabels,
  isGroupedSheet,
  navigateToPage,
  readAnswersFromSheet,
  removeAskUserQuestionSheet,
  setCurrentAnswer,
} from "./components/ask-user-question-bubble";

export type AskUserSheetContext = {
  mount: HTMLElement;
  overlay: HTMLElement;
  sessionRef: { current: AgentWidgetSession | null };
  /** Read live: `controller.update()` replaces the config. */
  config: () => AgentWidgetConfig;
};

export type AskUserSheetHandlers = {
  click: (event: MouseEvent) => void;
  keydown: (event: KeyboardEvent) => void;
};

export const createAskUserSheetHandlers = (ctx: AskUserSheetContext): AskUserSheetHandlers => {
  const { mount, overlay: askUserOverlay, sessionRef } = ctx;

  const submitAskUserAnswer = (
    sheet: HTMLElement,
    text: string,
    meta: {
      source: "pick" | "multi" | "free-text" | "submit-all";
      values?: string[];
      structured?: Record<string, string | string[]>;
    }
  ): void => {
    const trimmed = text.trim();
    if (!trimmed || !sessionRef.current) return;
    const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
    const isFreeText = meta.source === "free-text";

    // Dispatch before removing the sheet so listeners can still query DOM state.
    mount.dispatchEvent(
      new CustomEvent("persona:askUserQuestion:answered", {
        detail: {
          toolUseId: toolCallId,
          answer: trimmed,
          answers: meta.structured,
          values: meta.values ?? (meta.source === "multi" ? trimmed.split(", ") : [trimmed]),
          isFreeText,
          source: meta.source,
        },
        bubbles: true,
        composed: true,
      })
    );

    removeAskUserQuestionSheet(askUserOverlay, toolCallId);

    // Branch: LOCAL-tool pause (await) resumes via /resume with structured
    // toolOutputs; legacy path sends as a plain user message.
    const sourceMessage = sessionRef.current
      .getMessages()
      .find((m) => m.toolCall?.id === toolCallId);
    if (sourceMessage?.agentMetadata?.awaitingLocalTool) {
      sessionRef.current.resolveAskUserQuestion(sourceMessage, meta.structured ?? trimmed);
    } else {
      sessionRef.current.sendMessage(trimmed);
    }
  };

  /**
   * Persist in-progress grouped-question answers + page index back to the
   * source message so a refresh restores the user's spot.
   */
  const persistGroupedProgress = (sheet: HTMLElement): void => {
    const session = sessionRef.current;
    if (!session) return;
    const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
    const sourceMessage = session.getMessages().find((m) => m.toolCall?.id === toolCallId);
    if (!sourceMessage) return;
    session.persistAskUserQuestionProgress(sourceMessage, {
      answers: buildStructuredAnswers(sheet, sourceMessage),
      currentIndex: getCurrentIndex(sheet),
    });
  };

  /**
   * Build a one-line summary string for the legacy `answer` field on the
   * answered event when submit-all fires from a grouped sheet.
   */
  const stringifyStructured = (answers: Record<string, string | string[]>): string => {
    return Object.entries(answers)
      .map(([q, v]) => `${q}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join(" | ");
  };

  /**
   * If `groupedAutoAdvance` is enabled (default) and we're not on the final
   * page, advance one step. The final page never auto-submits: users always
   * confirm with an explicit Submit-all click so they can review.
   */
  const maybeAutoAdvance = (sheet: HTMLElement): void => {
    if (ctx.config().features?.askUserQuestion?.groupedAutoAdvance === false) return;
    const idx = getCurrentIndex(sheet);
    const count = getQuestionCount(sheet);
    if (idx >= count - 1) return;
    const sourceMessage = sessionRef.current
      ?.getMessages()
      .find((m) => m.toolCall?.id === sheet.getAttribute("data-tool-call-id"));
    if (!sourceMessage) return;
    navigateToPage(sheet, sourceMessage, ctx.config(), idx + 1);
    persistGroupedProgress(sheet);
  };

  const click = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLElement>("[data-ask-user-action]");
    if (!trigger) return;
    const sheet = trigger.closest<HTMLElement>("[data-persona-ask-sheet-for]");
    if (!sheet) return;

    const action = trigger.getAttribute("data-ask-user-action");
    event.preventDefault();
    event.stopPropagation();

    if (action === "dismiss") {
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      mount.dispatchEvent(
        new CustomEvent("persona:askUserQuestion:dismissed", {
          detail: { toolUseId: toolCallId },
          bubbles: true,
          composed: true,
        })
      );
      removeAskUserQuestionSheet(askUserOverlay, toolCallId);

      // Best-effort: if this sheet corresponds to a LOCAL-awaiting tool,
      // unblock the paused execution with a sentinel answer so the server
      // doesn't sit in waiting_for_local forever. Fire-and-forget: errors
      // are surfaced to the onError callback. Flip the answered flag first
      // so a racing render pass doesn't re-mount the sheet mid-dismissal.
      const sourceMessage = sessionRef.current
        ?.getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (sourceMessage?.agentMetadata?.awaitingLocalTool) {
        sessionRef.current?.markAskUserQuestionResolved(sourceMessage);
        sessionRef.current?.resolveAskUserQuestion(sourceMessage, "(dismissed)");
      }
      return;
    }

    if (action === "pick") {
      const label = trigger.getAttribute("data-option-label");
      if (!label) return;
      const multiSelect = sheet.getAttribute("data-multi-select") === "true";
      const grouped = isGroupedSheet(sheet);

      if (grouped && multiSelect) {
        const stored = readAnswersFromSheet(sheet)[getCurrentIndex(sheet)];
        const set = new Set<string>(Array.isArray(stored) ? stored : []);
        if (set.has(label)) set.delete(label);
        else set.add(label);
        setCurrentAnswer(sheet, Array.from(set));
        persistGroupedProgress(sheet);
        return;
      }

      if (grouped) {
        setCurrentAnswer(sheet, label);
        persistGroupedProgress(sheet);
        maybeAutoAdvance(sheet);
        return;
      }

      // 1-question modes: preserve original UX.
      if (multiSelect) {
        const pressed = trigger.getAttribute("aria-pressed") === "true";
        trigger.setAttribute("aria-pressed", pressed ? "false" : "true");
        trigger.classList.toggle("persona-ask-pill-selected", !pressed);
        const submitBtn = sheet.querySelector<HTMLButtonElement>(
          '[data-ask-user-action="submit-multi"]'
        );
        if (submitBtn) {
          submitBtn.disabled = getSelectedLabels(sheet).length === 0;
        }
        return;
      }
      submitAskUserAnswer(sheet, label, { source: "pick", values: [label] });
      return;
    }

    if (action === "submit-multi") {
      const labels = getSelectedLabels(sheet);
      if (labels.length === 0) return;
      submitAskUserAnswer(sheet, labels.join(", "), {
        source: "multi",
        values: labels,
      });
      return;
    }

    if (action === "open-free-text") {
      const row = sheet.querySelector<HTMLElement>('[data-ask-free-text-row="true"]');
      if (row) {
        row.classList.remove("persona-hidden");
        const input = row.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
        input?.focus();
      }
      return;
    }

    if (action === "focus-free-text") {
      // Rows-layout Other row: input lives inside the row container itself.
      // Native click on the input already focuses it; this branch handles
      // clicks on the badge or row chrome AND digit-shortcut activations.
      const input = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      input?.focus();
      return;
    }

    if (action === "submit-free-text") {
      const input = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      const text = input?.value ?? "";
      if (!text.trim()) return;
      if (isGroupedSheet(sheet)) {
        setCurrentAnswer(sheet, text.trim());
        persistGroupedProgress(sheet);
        maybeAutoAdvance(sheet);
        return;
      }
      submitAskUserAnswer(sheet, text, { source: "free-text" });
      return;
    }

    if (action === "next" || action === "back") {
      if (!sessionRef.current) return;
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      const sourceMessage = sessionRef.current
        .getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (!sourceMessage) return;
      // Flush any unsubmitted free-text input as the current answer.
      const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      const pending = freeInput?.value?.trim() ?? "";
      if (pending) {
        const stored = readAnswersFromSheet(sheet)[getCurrentIndex(sheet)];
        if (typeof stored !== "string" || stored !== pending) {
          setCurrentAnswer(sheet, pending);
        }
      }
      const direction = action === "next" ? 1 : -1;
      const nextIdx = getCurrentIndex(sheet) + direction;
      navigateToPage(sheet, sourceMessage, ctx.config(), nextIdx);
      persistGroupedProgress(sheet);
      return;
    }

    if (action === "submit-all") {
      if (!sessionRef.current) return;
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      const sourceMessage = sessionRef.current
        .getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (!sourceMessage) return;
      // Flush any pending free-text on the final page first.
      const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      const pending = freeInput?.value?.trim() ?? "";
      if (pending) setCurrentAnswer(sheet, pending);

      const structured = buildStructuredAnswers(sheet, sourceMessage);
      // Persist final answers to message metadata BEFORE resolving so the
      // answered-state review card (which reads `agentMetadata
      // .askUserQuestionAnswers`) shows the user's actual picks instead of
      // "(skipped)" placeholders. Without this, any answer set only via the
      // pending-flush above (or via paths that bypassed the per-pick persist
      // hook) would be missing from the transcript review even though it
      // landed in the structured payload sent to the agent.
      sessionRef.current.persistAskUserQuestionProgress(sourceMessage, {
        answers: structured,
        currentIndex: getCurrentIndex(sheet),
      });
      const summary = stringifyStructured(structured);
      submitAskUserAnswer(sheet, summary || "(submitted)", {
        source: "submit-all",
        structured,
      });
      return;
    }

    if (action === "skip") {
      if (!sessionRef.current) return;
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      const sourceMessage = sessionRef.current
        .getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (!sourceMessage) return;

      const grouped = isGroupedSheet(sheet);
      const idx = getCurrentIndex(sheet);
      const count = getQuestionCount(sheet);
      const isFinal = idx >= count - 1;

      // Single-question payloads behave like dismiss.
      if (!grouped) {
        mount.dispatchEvent(
          new CustomEvent("persona:askUserQuestion:dismissed", {
            detail: { toolUseId: toolCallId },
            bubbles: true,
            composed: true,
          })
        );
        removeAskUserQuestionSheet(askUserOverlay, toolCallId);
        if (sourceMessage.agentMetadata?.awaitingLocalTool) {
          sessionRef.current.markAskUserQuestionResolved(sourceMessage);
          sessionRef.current.resolveAskUserQuestion(sourceMessage, "(dismissed)");
        }
        return;
      }

      // Drop the current question's answer (if any) so it's absent from the
      // resolved Record. setCurrentAnswer with an empty string deletes the
      // index from the in-memory map.
      setCurrentAnswer(sheet, "");
      // Also clear any unsubmitted free-text on this page.
      const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      if (freeInput) freeInput.value = "";

      if (isFinal) {
        // Submit with whatever has been recorded so far.
        const structured = buildStructuredAnswers(sheet, sourceMessage);
        const summary = stringifyStructured(structured);
        submitAskUserAnswer(sheet, summary || "(skipped)", {
          source: "submit-all",
          structured,
        });
        return;
      }

      // Intermediate page: advance one step without recording.
      navigateToPage(sheet, sourceMessage, ctx.config(), idx + 1);
      persistGroupedProgress(sheet);
      return;
    }
  };

  // Enter on the free-text input → submit. Stays on the overlay because the
  // event target IS the input, which lives inside the overlay subtree.
  const keydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    const input = target as HTMLInputElement;
    if (!input.matches?.('[data-ask-free-text-input="true"]')) return;
    const sheet = input.closest<HTMLElement>("[data-persona-ask-sheet-for]");
    if (!sheet) return;
    event.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    if (isGroupedSheet(sheet)) {
      setCurrentAnswer(sheet, text.trim());
      persistGroupedProgress(sheet);
      maybeAutoAdvance(sheet);
      return;
    }
    submitAskUserAnswer(sheet, text, { source: "free-text" });
  };

  return { click, keydown };
};
