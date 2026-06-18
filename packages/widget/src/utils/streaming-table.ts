/**
 * Streaming markdown table stabilizer (Telegram-style space reservation).
 *
 * During SSE streaming the full accumulated markdown is re-parsed by `marked`
 * on every chunk. For GFM tables that produces two jarring jolts:
 *
 *  1. The paragraph→table flip. GFM only recognizes a table once the *delimiter*
 *     row (`| --- | --- |`) has arrived, so a freshly-streamed header line first
 *     renders as a plain paragraph and then snaps into a `<table>`.
 *  2. Partial-row flicker. The in-flight last row grows cell-by-cell.
 *
 * This module rewrites table-in-progress regions so a real `<table>` renders
 * from the first row onward with a stable column count: it completes the
 * delimiter row as soon as it starts streaming and pads the trailing partial
 * row to the header's column count. Combined with `table-layout: fixed` while
 * streaming (see `.persona-content-streaming table` in widget.css), columns lock
 * to even widths so rows append vertically without horizontal reflow.
 *
 * It runs ONLY while a message is streaming; the final render uses the real,
 * untouched `marked` output, so correctness is never affected.
 */

/**
 * A GFM delimiter row, full or still streaming in: only delimiter characters
 * (`-`, `:`, `|`, whitespace) and at least one dash. Matches `|`-led partials
 * like `| -`, `|--`, `| :--`, and complete rows like `| --- | :--: |`.
 */
const DELIMITER_RE = /^\s*\|?[\s:|-]*-[\s:|-]*$/;

/** A candidate table row contains at least one pipe. */
const hasPipe = (line: string): boolean => line.includes("|");

/** Split a markdown table row into trimmed cell strings, ignoring outer pipes. */
const splitCells = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
};

/** Render cells back into a normalized, pipe-delimited row. */
const buildRow = (cells: string[]): string => `| ${cells.join(" | ")} |`;

/** Build a complete delimiter row with the given column count. */
const buildDelimiter = (cols: number): string =>
  `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;

/** Pad (or trim) a row's cells to exactly `cols` columns. */
const fitCells = (cells: string[], cols: number): string[] => {
  if (cells.length >= cols) return cells.slice(0, cols);
  return cells.concat(Array.from({ length: cols - cells.length }, () => ""));
};

/**
 * Normalize any streaming-in-progress GFM tables in `markdown` so they render as
 * complete tables with a stable column count. Returns the input unchanged when
 * there is nothing to stabilize (cheap fast-path for the common no-table case).
 */
export const stabilizeStreamingTables = (markdown: string): string => {
  if (!markdown || !markdown.includes("|")) return markdown;

  const lines = markdown.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i];
    const delimiter = lines[i + 1];

    // A table starts at a header line (has a pipe, is not itself a delimiter)
    // immediately followed by a delimiter row that is full or still streaming.
    if (!hasPipe(header) || DELIMITER_RE.test(header)) continue;
    if (!DELIMITER_RE.test(delimiter)) continue;

    const cols = splitCells(header).length;
    if (cols < 1) continue;

    // Complete the delimiter to match the header's column count so `marked`
    // recognizes the table immediately instead of waiting for it to finish.
    const fullDelimiter = buildDelimiter(cols);
    if (lines[i + 1] !== fullDelimiter) {
      lines[i + 1] = fullDelimiter;
      changed = true;
    }

    // Normalize body rows (including a partial trailing one) to `cols` columns
    // so each row occupies its slot instead of growing cell-by-cell. The region
    // ends at the first blank or pipe-less line.
    let j = i + 2;
    for (; j < lines.length; j++) {
      const row = lines[j];
      if (row.trim() === "" || !hasPipe(row)) break;
      const normalized = buildRow(fitCells(splitCells(row), cols));
      if (lines[j] !== normalized) {
        lines[j] = normalized;
        changed = true;
      }
    }

    i = j - 1; // resume scanning after this table region
  }

  return changed ? lines.join("\n") : markdown;
};
