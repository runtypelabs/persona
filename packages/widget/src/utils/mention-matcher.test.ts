import { describe, it, expect } from "vitest";
import { defaultMentionFilter, createStaticMentionSource } from "./mention-matcher";
import type { AgentWidgetContextMentionItem } from "../types";

const item = (
  label: string,
  extra: Partial<AgentWidgetContextMentionItem> = {}
): AgentWidgetContextMentionItem => ({ id: label, label, ...extra });

describe("defaultMentionFilter", () => {
  it("returns all items recency-ordered for an empty query", () => {
    const items = [
      item("alpha", { recencyScore: 1 }),
      item("beta", { recencyScore: 5 }),
      item("gamma", { recencyScore: 3 }),
    ];
    expect(defaultMentionFilter(items, "").map((i) => i.label)).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
  });

  it("ranks prefix > word-boundary > subsequence", () => {
    const items = [
      item("subsequence_app_x"), // 'app' as subsequence only? actually contains 'app' as substring
      item("my-app-config"), // word boundary: 'app' starts the 'app' word
      item("application"), // prefix
      item("apricot pie"), // subsequence a-p-p? 'apricot pie' -> a,p,...,p (yes)
    ];
    const ranked = defaultMentionFilter(items, "app").map((i) => i.label);
    expect(ranked[0]).toBe("application"); // prefix wins
    expect(ranked.indexOf("my-app-config")).toBeLessThan(
      ranked.indexOf("apricot pie")
    );
  });

  it("drops non-matching items", () => {
    const items = [item("dashboard"), item("settings")];
    expect(defaultMentionFilter(items, "xyz")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const items = [item("README.md")];
    expect(defaultMentionFilter(items, "readme")).toHaveLength(1);
  });

  it("treats camelCase boundaries as word starts", () => {
    const items = [item("getUserName")];
    const ranked = defaultMentionFilter(items, "user");
    expect(ranked).toHaveLength(1);
  });

  it("breaks ties by recency then label", () => {
    const items = [
      item("appB", { recencyScore: 1 }),
      item("appA", { recencyScore: 1 }),
      item("appC", { recencyScore: 9 }),
    ];
    expect(defaultMentionFilter(items, "app").map((i) => i.label)).toEqual([
      "appC",
      "appA",
      "appB",
    ]);
  });
});

describe("createStaticMentionSource", () => {
  it("wires search() to defaultMentionFilter and passes resolve through", async () => {
    const resolve = async () => ({ llmAppend: "x" });
    const src = createStaticMentionSource({
      id: "files",
      label: "Files",
      items: [item("App.tsx"), item("index.ts")],
      resolve,
      resolveOn: "submit",
    });
    expect(src.id).toBe("files");
    expect(src.label).toBe("Files");
    expect(src.resolveOn).toBe("submit");
    const ctx = {} as never;
    const results = await src.search("app", ctx);
    expect(results.map((i) => i.label)).toEqual(["App.tsx"]);
    expect(src.resolve).toBe(resolve);
  });
});
