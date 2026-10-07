import { describe, expect, it } from "vitest";
import { CLAUSE_MAX_CHARS, ClauseBuffer } from "./voice-clause-buffer";

/** Push `chunks` one by one, then flush; returns every piece in order. */
function run(chunks: string[]): string[] {
  const buffer = new ClauseBuffer();
  const pieces = chunks.flatMap((chunk) => buffer.push(chunk));
  return [...pieces, ...buffer.flush()];
}

/** Push character by character (the worst case for boundary detection). */
const byChar = (text: string) => run([...text]);

describe("ClauseBuffer", () => {
  it("emits the first piece at a clause mark, then whole sentences", () => {
    expect(byChar("Sure, we open at eight. On Sundays we are closed. Anything else?")).toEqual([
      "Sure, ",
      "we open at eight. ",
      "On Sundays we are closed. ",
      "Anything else?",
    ]);
  });

  it("does not split later pieces at clause marks", () => {
    expect(byChar("Yes. Monday, Tuesday, and Friday work; Sunday doesn't. Done")).toEqual([
      "Yes. ",
      "Monday, Tuesday, and Friday work; Sunday doesn't. ",
      "Done",
    ]);
  });

  it("emits the first piece after ~30 characters or 6 words without punctuation", () => {
    const buffer = new ClauseBuffer();
    expect(buffer.push("We bake sourdough rye ")).toEqual([]);
    expect(buffer.push("and a seeded loaf every")).toEqual(["We bake sourdough rye and a seeded loaf "]);
    expect(buffer.push(" morning")).toEqual([]);
    expect(buffer.flush()).toEqual(["every morning"]);

    const words = new ClauseBuffer();
    expect(words.push("a b c d e f ")).toEqual(["a b c d e f "]);
  });

  it("keeps a whole first sentence together when it arrives before its trailing space", () => {
    const buffer = new ClauseBuffer();
    expect(buffer.push("I can place that order for you.")).toEqual([]);
    expect(buffer.flush()).toEqual(["I can place that order for you."]);
    expect(run(["I can place that order for you.", " Shall I?"])).toEqual(["I can place that order for you. ", "Shall I?"]);
  });

  it("keeps abbreviations, initials, decimals and list numbers inside a sentence", () => {
    expect(
      byChar("Hi there. Dr. Smith and J. R. Lee arrive at 9 a.m. today, e.g. for 3.5 hours. Then we close."),
    ).toEqual(["Hi there. ", "Dr. Smith and J. R. Lee arrive at 9 a.m. today, e.g. for 3.5 hours. ", "Then we close."]);
    expect(byChar("Steps:\n1. Mix the flour.\n2. Bake it.")).toEqual([
      "Steps:\n",
      "1. Mix the flour.\n",
      "2. Bake it.",
    ]);
    expect(byChar("Please call 911. It is urgent.")).toEqual(["Please call 911. ", "It is urgent."]);
  });

  it("treats line breaks (Markdown blocks and list items) as boundaries", () => {
    expect(byChar("**Opening hours**\n\n- Monday to Friday: 8am to 6pm\n- Sunday: closed")).toEqual([
      "**Opening hours**\n\n",
      "- Monday to Friday: 8am to 6pm\n",
      "- Sunday: closed",
    ]);
  });

  it("keeps closing quotes and emphasis with their sentence", () => {
    expect(byChar('He said "go." Then **we left.** Fine')).toEqual(['He said "go." ', "Then **we left.** ", "Fine"]);
    expect(byChar("Really?! Yes")).toEqual(["Really?! ", "Yes"]);
  });

  it("waits for whitespace after a period before cutting", () => {
    const buffer = new ClauseBuffer();
    expect(buffer.push("It costs 3.")).toEqual([]);
    expect(buffer.push("50 dollars. And")).toEqual(["It costs 3.50 dollars. "]);
  });

  it("caps pieces at the max length, cutting at a clause mark, then a word, then hard", () => {
    const clauses = `${"word ".repeat(30)}and then, ${"more ".repeat(30)}end.`;
    const buffer = new ClauseBuffer();
    expect(buffer.push("Hi. ")).toEqual([]); // the whitespace may still grow
    const [hi, ...pieces] = [...buffer.push(clauses), ...buffer.flush()];
    expect(hi).toBe("Hi. ");
    expect(pieces.every((p) => p.length <= CLAUSE_MAX_CHARS)).toBe(true);
    expect(pieces[0]).toMatch(/and then, $/);
    expect(pieces.join("")).toBe(clauses);

    const words = run(["Ok. ", "abcd ".repeat(100)]);
    expect(words.slice(1).every((p) => p.length <= CLAUSE_MAX_CHARS && /\s$/.test(p))).toBe(true);

    const solid = run(["x".repeat(500)]);
    expect(solid.map((p) => p.length)).toEqual([CLAUSE_MAX_CHARS, CLAUSE_MAX_CHARS, 60]);
  });

  it("never cuts inside a surrogate pair", () => {
    const text = `${"x".repeat(CLAUSE_MAX_CHARS - 1)}😀${"y".repeat(10)}`;
    const pieces = run([text]);
    expect(pieces.join("")).toBe(text);
    expect(pieces[0]).toBe("x".repeat(CLAUSE_MAX_CHARS - 1));
  });

  it("pieces always concatenate to the input, however it is chunked", () => {
    const text =
      "**Opening hours**\n\n- Monday to Friday: 8am to 6pm\n- Saturday: 9am to 4pm\n\nWe're on Main St. near the U.S. post office, e.g. by the park. Call us!  ";
    for (const size of [1, 2, 3, 7, 13, 40, text.length]) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
      const pieces = run(chunks);
      const joined = pieces.join("");
      expect(text.startsWith(joined)).toBe(true);
      expect(joined.trimEnd()).toBe(text.trimEnd());
      expect(pieces.every((p) => p.trim().length > 0 && p.length <= CLAUSE_MAX_CHARS)).toBe(true);
    }
  });

  it("idle() releases held text that ends in a terminator, and nothing else", () => {
    const buffer = new ClauseBuffer();
    expect(buffer.push("We're open Monday to Friday from 8am to 6pm.")).toEqual([]);
    expect(buffer.idle()).toEqual(["We're open Monday to Friday from 8am to 6pm."]);
    expect(buffer.idle()).toEqual([]);
    expect(buffer.push(" On Saturdays we open")).toEqual([]);
    expect(buffer.idle()).toEqual([]); // no terminator: keep waiting
    expect(buffer.push(" at 9 a.m.")).toEqual([]);
    expect(buffer.idle()).toEqual([" On Saturdays we open at 9 a.m."]); // no guards on a pause
    for (const ending of ["Really?!", 'He said "go."', "**Done.**", "Wait…", "Line\n"]) {
      const b = new ClauseBuffer();
      b.push(ending);
      expect(b.idle()).toEqual([ending]);
    }
  });

  it("emits nothing for whitespace only, and flush empties the buffer", () => {
    const buffer = new ClauseBuffer();
    expect(buffer.push("   ")).toEqual([]);
    expect(buffer.flush()).toEqual([]);
    expect(buffer.push("Hello")).toEqual([]);
    expect(buffer.flush()).toEqual(["Hello"]);
    expect(buffer.flush()).toEqual([]);
  });
});
