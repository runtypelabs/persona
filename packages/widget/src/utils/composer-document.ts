/**
 * Pure, DOM-free document model for the inline-mention composer
 * (`contextMentions.display: "inline"`).
 *
 * The canonical composer state is a flat, ordered list of blocks — text runs and
 * atomic mention tokens — rather than a single string with range markers. Blocks
 * make insert/remove, duplicate detection, and history round-trip explicit
 * without parsing HTML. The DOM adapter (`composer-contenteditable.ts`) renders a
 * document to a contenteditable surface and re-parses it back on input; this
 * module owns everything that does not touch the DOM, so it is unit-testable in
 * the Node env exactly like `mention-trigger.ts` and `composer-history.ts`.
 *
 * Three text projections exist, each for a distinct purpose:
 *  - `toPlainText`   — text blocks only (chip-mode `content` shim).
 *  - `toDisplayText` — text + `@label` per mention (the human-readable, sent
 *                      bubble / model-visible prose).
 *  - `toLogicalText` — text + `￼` (OBJECT REPLACEMENT CHAR) per mention. An
 *                      INTERNAL index space only — never shown to the user, never
 *                      sent to the model — that lets the existing
 *                      `parseMentionTrigger` run over `(logicalText, caret)` with
 *                      tokens standing in as single, query-terminating chars.
 */

import { MENTION_PLACEHOLDER } from "./mention-trigger";
import type {
  AgentWidgetContentSegment,
  AgentWidgetContextMentionPayload,
  AgentWidgetContextMentionRef
} from "../types";

// Single-sourced from the dependency-free trigger module (see its definition for
// why it lives there); re-exported here so existing importers keep working.
export { MENTION_PLACEHOLDER };

/** Stable id for one inline mention instance (DOM `data-mention-id`, history key). */
export type ComposerMentionId = string;

/** One block in the composer document. Order is significant. */
export type ComposerBlock =
  | { kind: "text"; value: string }
  | {
      kind: "mention";
      id: ComposerMentionId;
      ref: AgentWidgetContextMentionRef;
    };

/** Canonical inline-composer state. */
export type ComposerDocument = {
  blocks: ComposerBlock[];
};

/**
 * In-memory runtime for one mention while the message is being composed (not
 * stored on the sent message). The manager keys these by `ComposerMentionId` in
 * inline mode, mirroring the chip-mode `PendingMention` list.
 */
export type ComposerMentionState = {
  id: ComposerMentionId;
  ref: AgentWidgetContextMentionRef;
  status: "resolving" | "ready" | "error";
  payload?: AgentWidgetContextMentionPayload;
  abort?: AbortController;
  resolvePromise?: Promise<void>;
};

/** A logical-coordinate range `[start, end)` into `toLogicalText(doc)`. */
export type LogicalRange = { start: number; end: number };

/** Prefix shown before a mention's label in display/model-visible prose. */
const MENTION_DISPLAY_PREFIX = "@";

/** Logical length of a single block (`￼` counts as one char). */
function blockLength(block: ComposerBlock): number {
  return block.kind === "text" ? block.value.length : 1;
}

/**
 * Enforce the structural invariant that keeps caret placement stable: the
 * document begins and ends with a text block and no two mention blocks are
 * adjacent (an empty text block always separates them). Adjacent text runs are
 * merged. This never changes any projection's output (empty text contributes the
 * empty string) — it only guarantees a caret slot exists on every side of a token.
 */
function normalizeBlocks(blocks: ComposerBlock[]): ComposerBlock[] {
  const out: ComposerBlock[] = [];
  const pushText = (value: string): void => {
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.value += value;
    else out.push({ kind: "text", value });
  };

  // Ensure a leading text slot.
  if (blocks.length === 0 || blocks[0].kind !== "text") {
    out.push({ kind: "text", value: "" });
  }

  for (const block of blocks) {
    if (block.kind === "text") {
      pushText(block.value);
      continue;
    }
    // Guarantee a text block precedes this mention (it does by construction, but
    // stay defensive), then always trail one so the next block — text or another
    // mention — keeps the alternation.
    const last = out[out.length - 1];
    if (!last || last.kind !== "text") out.push({ kind: "text", value: "" });
    out.push({ kind: "mention", id: block.id, ref: block.ref });
    out.push({ kind: "text", value: "" });
  }

  const last = out[out.length - 1];
  if (!last || last.kind !== "text") out.push({ kind: "text", value: "" });
  return out;
}

/** `{ blocks: [{ kind: "text", value: "" }] }`. */
export function emptyDocument(): ComposerDocument {
  return { blocks: [{ kind: "text", value: "" }] };
}

/** Chip-mode shim: wrap a raw textarea value as a single text block. */
export function documentFromTextarea(value: string): ComposerDocument {
  return { blocks: [{ kind: "text", value }] };
}

/** Concatenate text blocks only — the chip-mode `content` projection. */
export function toPlainText(doc: ComposerDocument): string {
  return doc.blocks.map((b) => (b.kind === "text" ? b.value : "")).join("");
}

/** Text blocks + `@label` per mention — human-readable / model-visible prose. */
export function toDisplayText(doc: ComposerDocument): string {
  return doc.blocks
    .map((b) =>
      b.kind === "text" ? b.value : `${MENTION_DISPLAY_PREFIX}${b.ref.label}`
    )
    .join("");
}

/**
 * Text blocks + `￼` per mention — the internal caret/trigger index space for
 * reusing `parseMentionTrigger`. Never shown to the user, never sent to the model.
 */
export function toLogicalText(doc: ComposerDocument): string {
  return doc.blocks
    .map((b) => (b.kind === "text" ? b.value : MENTION_PLACEHOLDER))
    .join("");
}

/** Total logical length of the document. */
export function logicalLength(doc: ComposerDocument): number {
  return doc.blocks.reduce((sum, b) => sum + blockLength(b), 0);
}

/** Mention blocks in document order (source of submit `contextMentions`). */
export function mentionBlocksInOrder(
  doc: ComposerDocument
): Array<{ id: ComposerMentionId; ref: AgentWidgetContextMentionRef }> {
  const out: Array<{ id: ComposerMentionId; ref: AgentWidgetContextMentionRef }> =
    [];
  for (const b of doc.blocks) {
    if (b.kind === "mention") out.push({ id: b.id, ref: b.ref });
  }
  return out;
}

/**
 * Split `blocks` at a single logical offset, returning the blocks fully to the
 * left of `cut` and the blocks fully to the right (text blocks that straddle the
 * cut are sliced). Mention blocks (one logical char) never straddle in practice;
 * a defensive cut inside one keeps the whole token on the right.
 */
function splitBlocksAt(
  blocks: ComposerBlock[],
  cut: number
): { left: ComposerBlock[]; right: ComposerBlock[] } {
  const left: ComposerBlock[] = [];
  const right: ComposerBlock[] = [];
  let offset = 0;
  for (const block of blocks) {
    const len = blockLength(block);
    const end = offset + len;
    if (end <= cut) {
      left.push(block);
    } else if (offset >= cut) {
      right.push(block);
    } else if (block.kind === "text") {
      const at = cut - offset;
      if (at > 0) left.push({ kind: "text", value: block.value.slice(0, at) });
      if (at < len) right.push({ kind: "text", value: block.value.slice(at) });
    } else {
      right.push(block);
    }
    offset = end;
  }
  return { left, right };
}

/**
 * Replace the logical range `[range.start, range.end)` (the active `@query`,
 * trigger char through caret) with an atomic mention block for `ref`, keyed by
 * the caller-supplied `id`. Returns the new document and the caret offset just
 * after the inserted token. The caller owns id creation so this stays pure.
 */
export function insertMention(
  doc: ComposerDocument,
  range: LogicalRange,
  ref: AgentWidgetContextMentionRef,
  id: ComposerMentionId
): { doc: ComposerDocument; caret: number } {
  const before = splitBlocksAt(doc.blocks, range.start).left;
  const after = splitBlocksAt(doc.blocks, range.end).right;
  const blocks = normalizeBlocks([
    ...before,
    { kind: "mention", id, ref },
    ...after
  ]);
  // `before` spans exactly logical `[0, range.start)`; the token adds one char.
  const caret = range.start + 1;
  return { doc: { blocks }, caret };
}

/**
 * Drop the mention block with `id` and merge the surrounding text. Returns the
 * new document and the caret offset where the token used to be. No-op (same doc)
 * when the id is absent — the caret then points at end of document.
 */
export function removeMention(
  doc: ComposerDocument,
  id: ComposerMentionId
): { doc: ComposerDocument; caret: number } {
  let caret = 0;
  let offset = 0;
  let found = false;
  for (const block of doc.blocks) {
    if (block.kind === "mention" && block.id === id) {
      caret = offset;
      found = true;
    }
    offset += blockLength(block);
  }
  if (!found) return { doc, caret: offset };
  const blocks = normalizeBlocks(
    doc.blocks.filter((b) => !(b.kind === "mention" && b.id === id))
  );
  return { doc: { blocks }, caret };
}

/**
 * Replace the logical range `[start, end)` with plain `text`, preserving every
 * mention token that lies OUTSIDE the range and dropping any that fall inside it.
 * Returns the new document and the caret offset just after the inserted text.
 *
 * This is the general logical-range edit the DOM adapter needs whenever a native
 * edit can't be trusted to keep tokens atomic — paste over a selection, and
 * slash-command completion that rewrites a `/query` span while other tokens sit
 * elsewhere in the line. `start`/`end` are clamped and ordered defensively.
 */
export function spliceDocument(
  doc: ComposerDocument,
  start: number,
  end: number,
  text: string
): { doc: ComposerDocument; caret: number } {
  const total = logicalLength(doc);
  const lo = Math.max(0, Math.min(start, end, total));
  const hi = Math.min(total, Math.max(start, end, 0));
  const before = splitBlocksAt(doc.blocks, lo).left;
  const after = splitBlocksAt(doc.blocks, hi).right;
  const blocks = normalizeBlocks([
    ...before,
    { kind: "text", value: text },
    ...after
  ]);
  return { doc: { blocks }, caret: lo + text.length };
}

/** Structural subset of a message this module reads (avoids a heavy import). */
type MessageLike = {
  content?: string;
  contentSegments?: AgentWidgetContentSegment[];
};

/**
 * Reconstruct a document from a stored message: prefer `contentSegments` (full
 * fidelity, including token order and duplicates); fall back to a single text
 * block from `content`. Mention ids are regenerated (`m0`, `m1`, …) — they only
 * need to be unique within the recalled document.
 */
export function blocksFromMessage(msg: MessageLike): ComposerDocument {
  const segments = msg.contentSegments;
  if (segments && segments.length > 0) {
    const blocks: ComposerBlock[] = segments.map((seg, i) =>
      seg.kind === "text"
        ? { kind: "text", value: seg.text }
        : {
            kind: "mention",
            id: `m${i}`,
            ref: {
              sourceId: seg.sourceId,
              itemId: seg.itemId,
              label: seg.label,
              iconName: seg.iconName,
              color: seg.color
            }
          }
    );
    return { blocks: normalizeBlocks(blocks) };
  }
  return documentFromTextarea(msg.content ?? "");
}

/**
 * Produce the display/transcript fields a sent inline-mode message carries.
 * `content` is the human-readable prose (`@label` tokens inline); `contextMentions`
 * are the refs in document order; `contentSegments` is the full block list with
 * empty text runs dropped for a clean transcript. The model-visible channel
 * (`llmContent`/`contentParts`) is assembled separately by the manager bundle and
 * `session.applyMentionBundle` — this function does not touch it.
 */
export function documentToMessageFields(doc: ComposerDocument): {
  content: string;
  contextMentions: AgentWidgetContextMentionRef[];
  contentSegments: AgentWidgetContentSegment[];
} {
  const contentSegments: AgentWidgetContentSegment[] = [];
  for (const block of doc.blocks) {
    if (block.kind === "text") {
      if (block.value.length > 0) {
        contentSegments.push({ kind: "text", text: block.value });
      }
    } else {
      contentSegments.push({
        kind: "mention",
        sourceId: block.ref.sourceId,
        itemId: block.ref.itemId,
        label: block.ref.label,
        iconName: block.ref.iconName,
        color: block.ref.color
      });
    }
  }
  return {
    content: toDisplayText(doc),
    contextMentions: mentionBlocksInOrder(doc).map((m) => m.ref),
    contentSegments
  };
}
