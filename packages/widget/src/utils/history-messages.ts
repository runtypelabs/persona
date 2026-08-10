/**
 * History Wire Message Mapping
 *
 * Adapter from the Runtype `/v1/client/conversations` wire shape to widget
 * messages. The display projection (`displayContent`) is the only visible
 * authority: model-only content is never rendered and never re-enters the
 * model channel (`llmContent`/`rawContent` are never fabricated here).
 */

import type {
  AgentMessageMetadata,
  AgentWidgetMessage,
  AgentWidgetMessageRole,
  ContentPart,
} from "../types";
import {
  IMAGE_ONLY_MESSAGE_FALLBACK_TEXT,
  createFilePart,
  createImagePart,
  createTextPart,
  getDisplayText,
  hasImages,
} from "./content";

/** One message as served by the client conversation history route. */
export type HistoryWireMessage = {
  id: string;
  role: string;
  /** Model content: string (legacy render-safe fallback) or multi-modal parts. */
  content?: string | unknown[];
  /** Server-owned display projection. Absent and empty are distinct states. */
  displayContent?: string;
  /** False when no visible form is reconstructable (model content withheld). */
  displayAvailable: boolean;
  timestamp?: string;
};

/** One row of the conversation list. */
export type HistoryWireConversationSummary = {
  id: string;
  title: string;
  targetId: string | null;
  flowId: string;
  preview: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MapWireMessagesOptions = {
  /**
   * Oldest `createdAt` already in the transcript. Present when mapping an older
   * page that will be prepended: synthesized timestamps must land before it.
   */
  beforeCreatedAt?: string;
};

/** `agentMetadata` carrying the history marker; widened locally, not in types.ts. */
type HistoryAgentMetadata = AgentMessageMetadata & {
  /** Server withheld this message's content and no display form exists. */
  historyDisplayUnavailable?: true;
};

const WIDGET_ROLES: readonly string[] = ["user", "assistant", "system"];

/** Anchor for a page with no real timestamps and no older bound. */
const SYNTHETIC_EPOCH_MS = 0;

function parseMs(value: string | undefined): number | null {
  if (typeof value !== "string" || value === "") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Known content parts only; anything else is dropped rather than surfaced. */
function toContentPart(part: unknown): ContentPart | null {
  if (typeof part !== "object" || part === null) return null;
  const raw = part as Record<string, unknown>;
  switch (raw.type) {
    case "text":
      return typeof raw.text === "string" ? createTextPart(raw.text) : null;
    case "image":
      return typeof raw.image === "string"
        ? createImagePart(raw.image, {
            mimeType: optionalString(raw.mimeType),
            alt: optionalString(raw.alt),
          })
        : null;
    case "file":
      return typeof raw.data === "string" &&
        typeof raw.mimeType === "string" &&
        typeof raw.filename === "string"
        ? createFilePart(raw.data, raw.mimeType, raw.filename)
        : null;
    case "audio":
      return typeof raw.audio === "string"
        ? {
            type: "audio",
            audio: raw.audio,
            ...(optionalString(raw.mimeType) !== undefined && {
              mimeType: raw.mimeType as string,
            }),
          }
        : null;
    case "video":
      return typeof raw.video === "string"
        ? {
            type: "video",
            video: raw.video,
            ...(optionalString(raw.mimeType) !== undefined && {
              mimeType: raw.mimeType as string,
            }),
          }
        : null;
    default:
      return null;
  }
}

/**
 * Fill missing timestamps against the transcript boundary.
 *
 * A run of missing values counts back in 1 ms steps from its upper bound (the
 * next real timestamp, the older-page bound, or the lower of the two), so every
 * synthesized value stays strictly earlier than that bound and increases in
 * server order. With no upper bound the run steps forward from the previous
 * real timestamp. Deterministic: derived only from the inputs.
 */
function resolveCreatedAt(
  wire: readonly HistoryWireMessage[],
  beforeCreatedAt: string | undefined
): string[] {
  const boundMs = parseMs(beforeCreatedAt);
  const times = wire.map((message) => parseMs(message.timestamp));
  const resolved: number[] = new Array<number>(wire.length);

  let index = 0;
  while (index < times.length) {
    const known = times[index];
    if (known !== null) {
      resolved[index] = known;
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < times.length && times[end + 1] === null) end += 1;
    const runLength = end - index + 1;
    const lower = index > 0 ? resolved[index - 1] : null;
    const next = end + 1 < times.length ? times[end + 1] : null;
    const upper =
      next !== null && boundMs !== null
        ? Math.min(next, boundMs)
        : (next ?? boundMs);
    for (let offset = 0; offset < runLength; offset += 1) {
      resolved[index + offset] =
        upper !== null
          ? upper - (runLength - offset)
          : lower !== null
            ? lower + offset + 1
            : SYNTHETIC_EPOCH_MS + offset;
    }
    index = end + 1;
  }

  return resolved.map((ms) => new Date(ms).toISOString());
}

/**
 * Map wire history messages to widget messages.
 *
 * Display priority: `displayContent` (including an empty string) wins; a plain
 * string model `content` is the legacy fallback; parts become `contentParts`.
 */
export function mapWireMessages(
  wire: HistoryWireMessage[],
  opts?: MapWireMessagesOptions
): AgentWidgetMessage[] {
  const createdAtByIndex = resolveCreatedAt(wire, opts?.beforeCreatedAt);
  const mapped: AgentWidgetMessage[] = [];

  wire.forEach((message, index) => {
    if (typeof message?.id !== "string" || message.id === "") return;
    if (!WIDGET_ROLES.includes(message.role)) return;
    const role = message.role as AgentWidgetMessageRole;
    const createdAt = createdAtByIndex[index];

    // No reconstructable visible form: render nothing, mark the gap.
    if (message.displayAvailable === false) {
      const agentMetadata: HistoryAgentMetadata = {
        historyDisplayUnavailable: true,
      };
      mapped.push({ id: message.id, role, content: "", createdAt, agentMetadata });
      return;
    }

    if (typeof message.displayContent === "string") {
      mapped.push({
        id: message.id,
        role,
        content: message.displayContent,
        createdAt,
      });
      return;
    }

    if (typeof message.content === "string") {
      mapped.push({ id: message.id, role, content: message.content, createdAt });
      return;
    }

    if (Array.isArray(message.content)) {
      const parts = message.content
        .map(toContentPart)
        .filter((part): part is ContentPart => part !== null);
      const text = getDisplayText(parts);
      mapped.push({
        id: message.id,
        role,
        content:
          text || (hasImages(parts) ? IMAGE_ONLY_MESSAGE_FALLBACK_TEXT : ""),
        createdAt,
        ...(parts.length > 0 && { contentParts: parts }),
      });
      return;
    }

    mapped.push({ id: message.id, role, content: "", createdAt });
  });

  return mapped;
}

/**
 * The visitor-visible projection when it diverges from the model channel that
 * `/client/chat` stores (contract fact #15). `undefined` means the stored model
 * content already IS the projection, so nothing extra needs sending.
 */
export function divergentDisplayProjection(
  message: AgentWidgetMessage
): string | undefined {
  const display = message.content;
  if (typeof display !== "string" || display === "") return undefined;
  const model =
    message.contentParts ?? message.llmContent ?? message.rawContent ?? display;
  if (typeof model === "string" && model === display) return undefined;
  return display;
}

/** True when the server withheld this history message's content. */
export function isHistoryDisplayUnavailable(
  message: AgentWidgetMessage
): boolean {
  const metadata = message.agentMetadata as HistoryAgentMetadata | undefined;
  return metadata?.historyDisplayUnavailable === true;
}

/**
 * Merge pages by message id (incoming wins) into one array sorted the way
 * `sortMessages` sorts: `createdAt`, then `sequence`, then id.
 */
export function mergeWireMessagesById(
  existing: AgentWidgetMessage[],
  incoming: AgentWidgetMessage[]
): AgentWidgetMessage[] {
  const byId = new Map<string, AgentWidgetMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);

  return [...byId.values()].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    const seqA = a.sequence ?? 0;
    const seqB = b.sequence ?? 0;
    if (seqA !== seqB) return seqA - seqB;
    return a.id.localeCompare(b.id);
  });
}
