/**
 * Quote/reply-to wire representation.
 *
 * There is no native quote part on the wire yet, so the quoted material is
 * rendered as one clearly delimited text block placed BEFORE the user's own
 * text. It reuses `contextMentions`' fenced convention (and its fence-escalation
 * helper) so quoted material can never terminate its own wrapper and is legible
 * to the model as untrusted context rather than as instructions.
 *
 * Placement rules, chosen so a message without a quote is byte-identical to
 * before:
 *  - `contentParts` message: prepend one text part (contentParts wins the
 *    content priority chain, so `llmContent` would be ignored).
 *  - plain string message: set `llmContent` to block + text, leaving `content`
 *    (the displayed bubble) untouched.
 */

import type { ComposerQuote, ContentPart } from "../types";
import { createTextPart } from "./content";
import { fencedBlock } from "./mention-llm-format";

/** Info-string label; `sourceLabel` is appended when the host supplied one. */
const quoteLabel = (quote: ComposerQuote): string =>
  quote.sourceLabel ? `quoted-text source=${quote.sourceLabel}` : "quoted-text";

/**
 * The delimited block a quoted send prepends. Empty quote text yields `""`, so
 * callers can treat a blank quote as no quote at all.
 */
export function formatQuoteBlock(quote: ComposerQuote | undefined): string {
  const text = quote?.text?.trim() ?? "";
  if (!text) return "";
  return fencedBlock(quoteLabel(quote!), text);
}

/**
 * Apply the quote to an outgoing message's model-visible content. Returns the
 * fields to merge onto the user message; an absent or blank quote returns an
 * empty object so the non-quoted path never changes shape.
 */
export function applyQuoteToContent(input: {
  quote?: ComposerQuote;
  text: string;
  contentParts?: ContentPart[];
}): { contentParts?: ContentPart[]; llmContent?: string } {
  const block = formatQuoteBlock(input.quote);
  if (!block) return {};
  if (input.contentParts && input.contentParts.length > 0) {
    return { contentParts: [createTextPart(block), ...input.contentParts] };
  }
  return { llmContent: [block, input.text].filter(Boolean).join("\n\n") };
}

/** Single-line banner/card summary of a quote, collapsed and clamped. */
export function summarizeQuoteText(text: string, maxLength = 140): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1)}…`;
}
