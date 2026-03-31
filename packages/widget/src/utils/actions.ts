import type {
  AgentWidgetActionContext,
  AgentWidgetActionEventPayload,
  AgentWidgetActionHandler,
  AgentWidgetActionHandlerResult,
  AgentWidgetActionParser,
  AgentWidgetParsedAction,
  AgentWidgetControllerEventMap,
  AgentWidgetMessage
} from "../types";

type ActionManagerProcessContext = {
  text: string;
  message: AgentWidgetMessage;
  streaming: boolean;
  raw?: string;
};

type ActionManagerOptions = {
  parsers: AgentWidgetActionParser[];
  handlers: AgentWidgetActionHandler[];
  getSessionMetadata: () => Record<string, unknown>;
  updateSessionMetadata: (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  emit: <K extends keyof AgentWidgetControllerEventMap>(
    event: K,
    payload: AgentWidgetControllerEventMap[K]
  ) => void;
  documentRef: Document | null;
};

const stripCodeFence = (value: string) => {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1] : value;
};

const extractJsonObject = (value: string) => {
  const trimmed = value.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }
  return null;
};

export const defaultJsonActionParser: AgentWidgetActionParser = ({ text }) => {
  if (!text) return null;
  if (!text.includes("{")) return null;

  try {
    const withoutFence = stripCodeFence(text);
    const jsonBody = extractJsonObject(withoutFence);
    if (!jsonBody) return null;
    const parsed = JSON.parse(jsonBody);
    if (!parsed || typeof parsed !== "object" || !parsed.action) {
      return null;
    }
    const { action, ...payload } = parsed;
    return {
      type: String(action),
      payload,
      raw: parsed
    };
  } catch {
    return null;
  }
};

const asString = (value: unknown) =>
  typeof value === "string" ? value : value == null ? "" : String(value);

export const defaultActionHandlers: Record<
  string,
  AgentWidgetActionHandler
> = {
  message: (action) => {
    if (action.type !== "message") return;
    const text = asString((action.payload as Record<string, unknown>).text);
    return {
      handled: true,
      displayText: text
    };
  },
  messageAndClick: (action, context) => {
    if (action.type !== "message_and_click") return;
    const payload = action.payload as Record<string, unknown>;
    const selector = asString(payload.element);
    if (selector && context.document?.querySelector) {
      const element = context.document.querySelector<HTMLElement>(selector);
      if (element) {
        setTimeout(() => {
          element.click();
        }, 400);
      } else if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[AgentWidget] Element not found for selector:", selector);
      }
    }
    return {
      handled: true,
      displayText: asString(payload.text)
    };
  }
};

const ensureArrayOfStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  return [];
};

export const createActionManager = (options: ActionManagerOptions) => {
  let processedIds = new Set(
    ensureArrayOfStrings(options.getSessionMetadata().processedActionMessageIds)
  );

  const syncFromMetadata = () => {
    processedIds = new Set(
      ensureArrayOfStrings(options.getSessionMetadata().processedActionMessageIds)
    );
  };

  const persistProcessedIds = () => {
    const latestIds = Array.from(processedIds);
    options.updateSessionMetadata((prev) => ({
      ...prev,
      processedActionMessageIds: latestIds
    }));
  };

  const getFallbackDisplayText = (
    action: AgentWidgetParsedAction,
    fallbackText: string
  ) => {
    const payload = action.payload as Record<string, unknown>;
    const candidates = [
      payload.text,
      payload.displayText,
      payload.message,
      payload.content,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }

    return fallbackText;
  };

  const process = (context: ActionManagerProcessContext): { text: string; persist: boolean; resubmit?: boolean } | null => {
    if (context.streaming || context.message.role !== "assistant") {
      return null;
    }

    const parseSource =
      (typeof context.raw === "string" && context.raw) ||
      (typeof context.message.rawContent === "string" &&
        context.message.rawContent) ||
      (typeof context.text === "string" && context.text) ||
      null;

    if (!parseSource) {
      return null;
    }

    const action = parseSource
      ? options.parsers.reduce<AgentWidgetParsedAction | null>(
          (acc, parser) =>
            acc || parser?.({ text: parseSource, message: context.message }) || null,
          null
        )
      : null;

    if (!action) {
      return null;
    }

    const alreadyProcessed = processedIds.has(context.message.id);
    if (alreadyProcessed) {
      const displayText = getFallbackDisplayText(action, context.text);
      context.message.content = displayText;
      return { text: displayText, persist: true };
    }

    processedIds.add(context.message.id);
    persistProcessedIds();

    const eventPayload: AgentWidgetActionEventPayload = {
      action,
      message: context.message
    };
    options.emit("action:detected", eventPayload);

    for (const handler of options.handlers) {
      if (!handler) continue;
      try {
        // Create triggerResubmit function that emits the resubmit event
        // Handlers should call this AFTER async work completes (not return resubmit: true)
        const triggerResubmit = () => {
          options.emit("action:resubmit", eventPayload);
        };

        const handlerResult = handler(action, {
          message: context.message,
          metadata: options.getSessionMetadata(),
          updateMetadata: options.updateSessionMetadata,
          document: options.documentRef,
          triggerResubmit
        } as AgentWidgetActionContext) as AgentWidgetActionHandlerResult | void;

        if (!handlerResult) continue;

        if (handlerResult.handled) {
          // persistMessage defaults to true if not specified
          const persist = handlerResult.persistMessage !== false;
          const displayText = handlerResult.displayText !== undefined ? handlerResult.displayText : "";
          context.message.content = displayText;
          // Return resubmit flag - the caller (ui.ts) will handle deferred resubmit
          // after injectAssistantMessage is called (to avoid race conditions with async handlers)
          return { text: displayText, persist, resubmit: handlerResult.resubmit };
        }
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Action handler error:", error);
        }
      }
    }

    return { text: "", persist: true };
  };

  return {
    process,
    syncFromMetadata
  };
};
