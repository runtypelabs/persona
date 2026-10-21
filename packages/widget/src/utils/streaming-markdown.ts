import { stabilizeStreamingTables } from "./streaming-table";

const whitespace = (char: string): boolean => !char || /\s/.test(char);
const punctuation = (char: string): boolean => !!char && /[\p{P}\p{S}]/u.test(char);

// Code delimiters close only on a backtick run of exactly the same length.
const codeSpanEnd = (source: string, start: number, end: number): number => {
  const marker = source.slice(start, end);
  let closing = end;
  while ((closing = source.indexOf(marker, closing)) !== -1) {
    if (source[closing - 1] !== "`" && source[closing + marker.length] !== "`") return closing + marker.length;
    closing += marker.length;
  }
  return -1;
};

/** Display-only completion for the ordinary inline syntax arriving at the stream tail.
 * This is deliberately not a Markdown parser: ambiguous literals and block syntax
 * remain Marked's responsibility. Never persist this result or use it at completion.
 */
const stabilizeInline = (source: string, links = true): string => {
  const pending: { marker: string }[] = [];
  const literalMarkers = new Set<string>();
  let output = "";
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === "\\") {
      output += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (char === "`") {
      let end = i + 1;
      while (source[end] === "`") end++;
      const marker = source.slice(i, end);
      const closing = codeSpanEnd(source, i, end);
      if (closing !== -1) {
        output += source.slice(i, closing);
        i = closing;
      } else {
        const body = source.slice(end);
        // An empty run could still become a fence or literal. Hold it briefly.
        output += body ? `${marker}${body}${body.endsWith("`") ? " " : ""}${marker}` : "";
        i = source.length;
      }
      continue;
    }
    if (char === "<") {
      const end = source.indexOf(">", i + 1);
      output += source.slice(i, end < 0 ? source.length : end + 1);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (links && (char === "[" || (char === "!" && source[i + 1] === "["))) {
      const image = char === "!";
      const start = i + (image ? 2 : 1);
      let depth = 1;
      let end = start;
      for (; end < source.length; end++) {
        if (source[end] === "\\") { end++; continue; }
        if (source[end] === "`") {
          let runEnd = end + 1;
          while (source[runEnd] === "`") runEnd++;
          const closing = codeSpanEnd(source, end, runEnd);
          // Unmatched runs are literal Markdown, so their brackets still count.
          end = (closing < 0 ? runEnd : closing) - 1;
          continue;
        }
        if (source[end] === "[") depth++;
        if (source[end] === "]" && --depth === 0) break;
      }
      if (end >= source.length) {
        output += image ? "" : stabilizeInline(source.slice(start), false);
        break;
      }
      if (source[end + 1] === "(") {
        let parentheses = 1;
        let quote = "";
        let angle = false;
        let destination = end + 2;
        for (; destination < source.length; destination++) {
          const next = source[destination];
          if (next === "\\") { destination++; continue; }
          if (quote) { if (next === quote) quote = ""; continue; }
          if ((next === '"' || next === "'") && whitespace(source[destination - 1])) { quote = next; continue; }
          if (next === "<") angle = true;
          if (next === ">") angle = false;
          if (!angle && next === "(") parentheses++;
          if (!angle && next === ")" && --parentheses === 0) break;
        }
        if (destination >= source.length) {
          output += image ? "" : stabilizeInline(source.slice(start, end), false);
          break;
        }
        output += source.slice(i, destination + 1);
        i = destination + 1;
        continue;
      }
      if (end === source.length - 1) {
        output += image ? "" : stabilizeInline(source.slice(start, end), false);
        break;
      }
      // Reference links and ordinary bracketed prose are left to Marked.
      output += source.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (char === "*" || char === "_") {
      let end = i + 1;
      while (source[end] === char) end++;
      const marker = source.slice(i, end);
      const before = source[i - 1] ?? "";
      const after = source[end] ?? "";
      const left = !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
      const right = !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
      let remaining = marker.length;
      if (right && (char !== "_" || !left || punctuation(after))) {
        while (remaining && pending[pending.length - 1]?.marker[0] === char) {
          const top = pending[pending.length - 1];
          const consumed = Math.min(remaining, top.marker.length);
          remaining -= consumed;
          top.marker = top.marker.slice(consumed);
          if (!top.marker) pending.pop();
        }
      }
      if (remaining && marker.length <= 3 && left && !right) {
        pending.push({ marker: char.repeat(remaining) });
      } else if (remaining === marker.length && end === source.length && whitespace(before)
        && source.slice(source.lastIndexOf("\n", i) + 1, i).trim()
        && (pending.length > 0 || !literalMarkers.has(char))) {
        // Hold an opening run after prose, but preserve ambiguous list/rule lines.
        i = end;
        continue;
      }
      // Whitespace on both sides makes this punctuation literal, as in
      // `_ literal _`. Completed emphasis earlier in the paragraph does not
      // make a later opening run literal.
      if (whitespace(before) && whitespace(after) && end < source.length) literalMarkers.add(char);
      output += marker;
      i = end;
      continue;
    }
    output += char;
    i++;
  }
  // Trailing whitespace cannot precede a Markdown closing delimiter. Keep the
  // whitespace outside the temporary span, preserving it for the next chunk.
  const trailing = output.match(/\s*$/)?.[0] ?? "";
  output = output.slice(0, output.length - trailing.length);
  // A final escape must not swallow the first synthetic closing delimiter.
  if (pending.length && (output.match(/\\+$/)?.[0].length ?? 0) % 2) output += "\\";
  for (let i = pending.length - 1; i >= 0; i--) output += pending[i].marker;
  return output + trailing;
};

export const stabilizeStreamingMarkdown = (source: string): string => {
  let output = "";
  let prose = "";
  let fence = "";
  const flush = (): void => {
    // Restrict inline repairs to the current paragraph, so literal unmatched
    // punctuation earlier in the response cannot style subsequent blocks.
    output += stabilizeStreamingTables(prose).split(/(\n\s*\n)/).map((part) =>
      /^\n\s*\n$/.test(part) ? part : stabilizeInline(part)
    ).join("");
    prose = "";
  };
  for (const line of source.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const match = /^(?: {0,3}> ?)* {0,3}(?:[-+*] )?(`{3,}|~{3,})(.*)/.exec(line);
    if (fence) {
      output += line;
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = "";
    } else if (match) {
      flush();
      fence = match[1];
      output += line;
    } else if (/^(?: {4}|\t)/.test(line)) {
      flush();
      output += line;
    } else {
      prose += line;
    }
  }
  flush();
  return output;
};
