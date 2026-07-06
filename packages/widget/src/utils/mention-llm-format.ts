import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetMentionLlmEntry,
} from "../types";

/**
 * Longest run of leading backticks on any line of `text`. A fenced block whose
 * fence is longer than this can safely wrap the body without the body's own
 * fences closing it early. CommonMark treats a closing fence indented by up to
 * three spaces as valid, so indented runs count too.
 */
function longestLeadingBacktickRun(text: string): number {
  let longest = 0;
  for (const line of text.split("\n")) {
    const match = /^ {0,3}(`+)/.exec(line);
    if (match && match[1].length > longest) longest = match[1].length;
  }
  return longest;
}

/**
 * Wrap `text` in a fenced code block carrying `label` in the info string. The
 * fence escalates past any backtick run inside the body (three backticks by
 * default, four/five/… when the body itself contains a fence) so a mention body
 * can never terminate its own wrapper.
 */
function fencedBlock(label: string, text: string): string {
  const fence = "`".repeat(Math.max(3, longestLeadingBacktickRun(text) + 1));
  return `${fence}${label}\n${text}\n${fence}`;
}

/**
 * Anthropic's documented long-context document shape. `index` is 0-based here
 * and rendered 1-based (`index + 1`) to match Anthropic's example numbering.
 * A body containing the literal `</document_content>` closing tag would break
 * the XML boundary, so that one entry falls back to the fenced block, which has
 * no such collision.
 */
function documentBlock(label: string, text: string, index: number): string {
  if (text.includes("</document_content>")) return fencedBlock(label, text);
  return (
    `<document index="${index + 1}">\n` +
    `<source>${label}</source>\n` +
    `<document_content>\n${text}\n</document_content>\n` +
    `</document>`
  );
}

/**
 * Format one resolved mention into the ready-to-join LLM block string, per the
 * widget's `contextMentions.llmFormat`. `index` is the 0-based position of this
 * block among the message's contributed mention blocks (used by the `"document"`
 * preset's 1-based numbering and passed through to the function form).
 *
 * A throwing function-form template falls back to the fenced preset for that
 * entry instead of propagating: `finalize()` runs the whole assembly in one
 * pass, so an uncaught throw here would reject the entire bundle and silently
 * drop every mention's context (plus contentParts and structured context) from
 * the outgoing message — far worse than one host-formatted block degrading.
 */
export function formatMentionBlock(
  entry: AgentWidgetMentionLlmEntry,
  index: number,
  format: AgentWidgetContextMentionConfig["llmFormat"] = "fenced"
): string {
  if (typeof format === "function") {
    try {
      return format(entry, index);
    } catch (error) {
      console.warn(
        "[persona] contextMentions.llmFormat threw; falling back to the fenced format for this mention",
        error
      );
      return fencedBlock(entry.label, entry.text);
    }
  }
  if (format === "document") return documentBlock(entry.label, entry.text, index);
  return fencedBlock(entry.label, entry.text);
}
