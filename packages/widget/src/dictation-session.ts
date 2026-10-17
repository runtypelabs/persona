import type { ComposerInputCapability } from "./utils/composer-input";
import type { AgentWidgetConfig, DictationRenderHandle, DictationRenderContext, DictationState } from "./types";
import type { AgentWidgetPlugin } from "./plugins/types";
import { DictationController } from "./voice/dictation";
import { createDictationRenderer, type DictationRendererDeps } from "./components/dictation";

export interface DictationSessionOptions {
  instanceId: string;
  getTextarea: () => HTMLTextAreaElement;
  getFooter: () => HTMLElement;
  getConfig: () => AgentWidgetConfig;
  plugins: AgentWidgetPlugin[];
  getInlineInput: () => ComposerInputCapability | null | undefined;
  isInputDisabled: () => boolean;
  isSendBlocked: () => boolean;
  syncText: () => void;
  onSend: () => void;
  onState: (state: DictationState, capturing: boolean) => void;
  rendererDeps: DictationRendererDeps;
}

/** Per-instance composer integration, fetched only for dedicated dictation. */
export function createDictationSession(options: DictationSessionOptions) {
  let dictationRender: DictationRenderHandle | null = null;
  let dictationDraft = "";
  let dictationLogicalEnd: number | null = null;
  let dictationEditorReadOnly = false;
  let dictationContentEditable: string | null = null;
  let dictationPhase: DictationState["phase"] = "idle";
  const dictationHidden = new Map<HTMLElement, string>();
  const restoreDictationComposer = () => {
    for (const [element, display] of dictationHidden) element.style.display = display;
    dictationHidden.clear();
  };
  const writeDictationText = (text = "") => {
    const suffix = (dictationDraft && text && !/\s$/.test(dictationDraft) ? " " : "") + text;
    const input = options.getInlineInput();
    if (input?.replaceLogicalRange && dictationLogicalEnd !== null) {
      input.replaceLogicalRange(dictationLogicalEnd, input.getLogicalText().length, suffix);
      input.dispatchInput();
    } else options.getTextarea().value = dictationDraft + suffix;
    options.syncText();
  };

  const controller = new DictationController({
    onReview: writeDictationText,
    onSend: () => { if (!options.isSendBlocked()) options.onSend(); },
    onState: (state, levelOnly) => {
          const config = options.getConfig();
          const textarea = options.getTextarea();
          const footer = options.getFooter();
          const previousPhase = dictationPhase;
          dictationPhase = state.phase;
          const capturing = state.phase === "recording" || state.phase === "processing";
          textarea.readOnly = capturing || dictationEditorReadOnly;
          if (!(textarea instanceof HTMLTextAreaElement)) (textarea as HTMLElement).setAttribute("contenteditable", capturing || options.isInputDisabled() ? "false" : dictationContentEditable ?? "true");
          if (state.phase === "idle" && ["recording", "processing", "error"].includes(previousPhase)) {
            writeDictationText();
          } else if (capturing && config.voiceRecognition?.dictation?.display === "inline") {
            const text = state.transcript || state.interimTranscript;
            writeDictationText(text);
          }
          if (state.phase === "error") writeDictationText();
          const context: DictationRenderContext = {
            instanceId: options.instanceId, state, config,
            actions: { cancel: () => { controller.cancel(); }, finish: () => { controller.finish(); },
              ...(config.voiceRecognition?.dictation?.showSend && !options.isSendBlocked() ? { send: () => { if (!options.isSendBlocked()) controller.finish(true) || controller.send(); } } : {}) },
            defaultRenderer: () => createDictationRenderer(context, options.rendererDeps),
          };
          const visible = ["recording", "processing", "error"].includes(state.phase);
          if (!dictationRender && visible) {
            for (const plugin of options.plugins) {
              const result = plugin.renderDictation?.(context);
              if (result) { dictationRender = result instanceof HTMLElement ? { element: result } : result; break; }
            }
            dictationRender ??= context.defaultRenderer();
            dictationRender.element.addEventListener("keydown", (event) => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); controller.cancel(); }
            });
          }
          if (dictationRender && visible) {
            const target = footer.querySelector<HTMLElement>("[data-persona-composer-form]") ?? footer;
            if (dictationRender.element.parentElement !== target) target.append(dictationRender.element);
            restoreDictationComposer();
            const hide = config.voiceRecognition?.dictation?.display === "inline"
              ? Array.from(target.querySelectorAll<HTMLElement>("[data-persona-composer-actions-start], [data-persona-composer-actions-end]"))
              : Array.from(target.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== dictationRender?.element);
            for (const node of hide) { dictationHidden.set(node, node.style.display); node.style.display = "none"; }
            dictationRender.update?.(context);
            if ((state.phase === "recording" && previousPhase !== "recording" && previousPhase !== "processing") || (state.phase === "error" && previousPhase !== "error")) {
              dictationRender.element.querySelector<HTMLElement>("button:not(:disabled), [tabindex]")?.focus();
            }
          } else {
            restoreDictationComposer();
            dictationRender?.destroy?.();
            dictationRender?.element.remove();
            dictationRender = null;
            if ((state.phase === "review" || state.phase === "idle") && state.phase !== previousPhase) textarea.focus();
          }
          if (!levelOnly) {
            options.onState(state, capturing);
          }
    },
  });
  return {
    start(provider: Parameters<DictationController["start"]>[0], capture: Parameters<DictationController["start"]>[1], draft: { text: string; logicalEnd: number | null; readOnly: boolean; contentEditable: string | null }) {
      dictationDraft = draft.text;
      dictationLogicalEnd = draft.logicalEnd;
      dictationEditorReadOnly = draft.readOnly;
      dictationContentEditable = draft.contentEditable;
      return controller.start(provider, capture);
    },
    getState: () => controller.getState(),
    refresh: () => controller.refresh(),
    cancel: () => controller.cancel(),
    finish: (send = false) => controller.finish(send),
    send: () => controller.send(),
    destroy() {
      controller.destroy();
      restoreDictationComposer();
      dictationRender?.destroy?.();
      dictationRender?.element.remove();
    },
  };
}
export type DictationSession = ReturnType<typeof createDictationSession>;
