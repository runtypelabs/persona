/**
 * Resolve the text that should be spoken for an assistant message.
 *
 * Some flows return an action-format envelope as the message body — e.g.
 * `{"action":"message","text":"Hello"}`, often inside a ```json fence — rather
 * than plain prose. Speaking the raw JSON (or, after fenced-code stripping,
 * nothing at all) is useless, so we first try to extract the human `text` field
 * (mirroring the widget's `defaultJsonActionParser`, which also keys on
 * `.text`), and otherwise fall back to stripping Markdown from the raw content.
 */
export function resolveSpeakableText(raw: string): string {
  if (!raw) return "";
  const actionText = extractActionMessageText(raw);
  if (actionText !== null) return stripMarkdownForSpeech(actionText);
  return stripMarkdownForSpeech(raw);
}

/**
 * If `raw` is (or wraps, in a ```json fence) a JSON object with a string `text`
 * property, return that text; otherwise return `null`. Matches the action
 * envelope shape `{ action, text, ... }` used by the widget's action system.
 */
export function extractActionMessageText(raw: string): string | null {
  let body = raw.trim();
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) body = fence[1].trim();
  if (!body.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && typeof (parsed as { text?: unknown }).text === "string") {
      return (parsed as { text: string }).text;
    }
  } catch {
    // Not valid JSON — fall through to the Markdown path.
  }
  return null;
}

/**
 * Convert Markdown to plain text suitable for text-to-speech.
 *
 * Read-aloud should speak the prose a user sees, not the markup: code fences,
 * backticks, emphasis markers, link/image syntax and raw HTML are all noise
 * when spoken. This is intentionally lightweight (regex-based, no full Markdown
 * parser) — it favours predictable, dependency-free output over perfect
 * fidelity. Speech engines receive the result of this function, never raw
 * Markdown.
 */
export function stripMarkdownForSpeech(markdown: string): string {
  if (!markdown) return "";
  let text = markdown;

  // Fenced code blocks: drop entirely (reading source aloud is noise).
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/~~~[\s\S]*?~~~/g, " ");

  // Inline code: keep the inner text, drop the backticks.
  text = text.replace(/`([^`]+)`/g, "$1");

  // Images: speak the alt text only.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Inline links: speak the link text, drop the URL.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Reference-style links/images: [text][ref] -> text.
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");

  // Raw HTML tags.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, " ");

  // Line-leading markers: headings, blockquotes, list bullets, ordered items.
  text = text.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  text = text.replace(/^[ \t]*>[ \t]?/gm, "");
  text = text.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  text = text.replace(/^[ \t]*\d+\.[ \t]+/gm, "");

  // Horizontal rules.
  text = text.replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, " ");

  // Emphasis / strikethrough markers (bold before italic so ** is consumed).
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");

  // Decode a few common HTML entities so they aren't spoken literally.
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace.
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/[ \t]*\n[ \t]*/g, "\n");
  text = text.replace(/\n{2,}/g, "\n");

  return text.trim();
}
