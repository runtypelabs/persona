/**
 * Groups a growing answer into speakable pieces for `delegation_delta`
 * (streaming client delegation): the first piece goes out early (at a clause
 * mark, or once ~30 characters / 6 words are in), later pieces at sentence ends
 * or line breaks, and no piece is longer than {@link CLAUSE_MAX_CHARS}.
 *
 * Pieces are exact slices of the input: concatenated, they equal everything
 * pushed so far (whitespace included), so a receiver can count them as a
 * prefix of the final text.
 */

/** The longest piece. */
export const CLAUSE_MAX_CHARS = 220;
const FIRST_MIN_CHARS = 30;
const FIRST_MIN_WORDS = 6;

/** Words ending in "." that rarely end a sentence (lowercased, inner dots kept). */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "mt",
  "vs",
  "etc",
  "approx",
  "inc",
  "ltd",
  "co",
  "corp",
  "no",
  "nos",
  "fig",
  "ft",
  "dept",
  "est",
  "min",
  "max",
  "e.g",
  "i.e",
  "a.m",
  "p.m",
  "u.s",
  "u.k",
]);

// Punctuation (then closers like quotes, brackets or Markdown emphasis) and the
// whitespace after it, or a line break.
const BOUNDARY = /([.!?]+|[,;:])(["'”’)\]*_]*)(\s+)|\n\s*/g;

/** Whether the "." ending `before` belongs to an abbreviation, an initial, or a list number. */
function dotIsNotSentenceEnd(before: string): boolean {
  const token = /(\S+)$/.exec(before)?.[1];
  if (!token) return false;
  const word = token.replace(/^[("'“‘[*_]+/, "").toLowerCase();
  if (ABBREVIATIONS.has(word)) return true;
  // An initial ("J.") or a dotted abbreviation ("U.S", "e.g").
  if (/^[a-z](?:\.[a-z])*$/.test(word)) return true;
  // "1. " opening a line is a list marker, not a sentence.
  if (/^\d+$/.test(token)) {
    const start = before.length - token.length;
    return start === 0 || /\n\s*$/.test(before.slice(0, start));
  }
  return false;
}

/**
 * Ends (after the whitespace) of each boundary in `text` with content before
 * it. A boundary whose whitespace reaches the end of `text` may still grow
 * ("\n" then "\n- item"), so it counts only once more text follows.
 */
function* boundaryEnds(text: string, clauses: boolean): Generator<number> {
  const re = new RegExp(BOUNDARY.source, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const mark = m[1];
    if (!text.slice(0, m.index + (mark?.length ?? 0)).trim()) continue;
    if (mark !== undefined) {
      if (/^[,;:]$/.test(mark) && !clauses) continue;
      if (mark === "." && dotIsNotSentenceEnd(text.slice(0, m.index))) continue;
    }
    const end = m.index + m[0].length;
    if (end < text.length) yield end;
  }
}

/** End of the last whitespace run within `limit` that has content before it, or 0. */
function lastWordEnd(text: string, limit: number): number {
  const window = text.slice(0, limit);
  let best = 0;
  for (const m of window.matchAll(/\s+/g)) {
    if (window.slice(0, m.index).trim()) best = m.index! + m[0].length;
  }
  return best;
}

/** Where to cut a piece that reached {@link CLAUSE_MAX_CHARS} with no sentence end. */
function overflowCut(text: string): number {
  let clause = 0;
  for (const end of boundaryEnds(text.slice(0, CLAUSE_MAX_CHARS), true)) clause = end;
  if (clause) return clause;
  const word = lastWordEnd(text, CLAUSE_MAX_CHARS);
  if (word) return word;
  // One unbroken run: cut hard, never inside a surrogate pair.
  const code = text.charCodeAt(CLAUSE_MAX_CHARS - 1);
  return code >= 0xd800 && code <= 0xdbff ? CLAUSE_MAX_CHARS - 1 : CLAUSE_MAX_CHARS;
}

export class ClauseBuffer {
  #pending = "";
  #first = true;

  /** Add text; returns the pieces now complete (possibly none). */
  push(text: string): string[] {
    this.#pending += text;
    return this.#drain();
  }

  /** Everything still held, as the last pieces (whitespace-only remainder is dropped). */
  flush(): string[] {
    const pieces = this.#drain();
    const rest = this.#pending;
    this.#pending = "";
    if (rest.trim()) {
      for (let at = 0; at < rest.length; ) {
        const tail = rest.slice(at);
        const cut = tail.length > CLAUSE_MAX_CHARS ? overflowCut(tail) : tail.length;
        pieces.push(tail.slice(0, cut));
        at += cut;
      }
      this.#first = false;
    }
    return pieces;
  }

  /**
   * The stream went quiet: if the held text ends in a sentence terminator
   * (`. ! ? …`, closers allowed) or a line break, release it as if the
   * boundary were confirmed. No abbreviation guards: a pause is enough.
   */
  idle(): string[] {
    const text = this.#pending;
    if (!text.trim() || !/(?:[.!?…]["'”’)\]*_]*|\n)\s*$/.test(text)) return [];
    this.#pending = "";
    this.#first = false;
    const pieces: string[] = [];
    for (let at = 0; at < text.length; ) {
      const tail = text.slice(at);
      const cut = tail.length > CLAUSE_MAX_CHARS ? overflowCut(tail) : tail.length;
      pieces.push(tail.slice(0, cut));
      at += cut;
    }
    return pieces;
  }

  #drain(): string[] {
    const pieces: string[] = [];
    for (let cut = this.#cut(); cut > 0; cut = this.#cut()) {
      pieces.push(this.#pending.slice(0, cut));
      this.#pending = this.#pending.slice(cut);
      this.#first = false;
    }
    return pieces;
  }

  /** Length of the next complete piece, or 0 to keep waiting. */
  #cut(): number {
    const text = this.#pending;
    if (!text.trim()) return 0;
    const end = boundaryEnds(text, this.#first).next().value ?? 0;
    if (end && end <= CLAUSE_MAX_CHARS) return end;
    // Ending on sentence punctuation, the text is most likely a whole sentence
    // waiting for the space that confirms it: don't split it early.
    const atSentenceEnd = /[.!?]["'”’)\]*_]*$/.test(text);
    if (this.#first && !atSentenceEnd) {
      const words = text.match(/\S+\s+/g)?.length ?? 0;
      if (text.trim().length >= FIRST_MIN_CHARS || words >= FIRST_MIN_WORDS) {
        const word = lastWordEnd(text, CLAUSE_MAX_CHARS);
        if (word) return word;
      }
    }
    return text.length > CLAUSE_MAX_CHARS ? overflowCut(text) : 0;
  }
}
