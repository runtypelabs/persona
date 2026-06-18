/**
 * Normalize text pulled from a native browser selection before it is written to
 * the clipboard.
 *
 * When a user triple-clicks a chat bubble and presses Ctrl/Cmd-C, the browser
 * serializes the DOM selection itself. Markdown is rendered into block-level
 * elements (`<p>`, `<li>`, `<pre>`, …), and browsers emit surrounding newlines
 * for those blocks — so copying a single message drags along stray leading
 * blank lines and a trailing newline that the user never visually selected.
 *
 * This trims the outer whitespace so the clipboard matches the visible
 * selection, while preserving:
 *   - interior newlines (a multi-paragraph or multi-message selection keeps its
 *     line breaks), and
 *   - leading indentation on the first line (e.g. copied code keeps its indent;
 *     only fully-blank leading lines are dropped).
 */
export const normalizeCopiedSelectionText = (text: string): string =>
  text.replace(/^\n+/, "").replace(/\s+$/, "");
