import { describe, expect, it } from "vitest";

import {
  applyCurrentProductComposer,
  CHATGPT_TOOL_COMMANDS,
  CHATGPT_TOOL_MODES,
  CLAUDE_SKILL_COMMANDS,
} from "./recreation-composer-presets";

describe("current product composer presets", () => {
  it("keeps each welcome suggestion surface while replacing composer chrome", () => {
    const chatgpt = applyCurrentProductComposer("chatgpt", {
      suggestions: { starters: { items: ["Keep me"] } },
      theme: { components: { suggestion: { chip: { fontSize: "13px" } } } },
    });

    expect(chatgpt.suggestions?.starters?.items).toEqual(["Keep me"]);
    expect(chatgpt.composer?.layout).toBe("single-row");
    expect(chatgpt.composer?.selectedModelId).toBe("high");
    expect(chatgpt.sendButton?.visibility).toBe("when-text");
    expect(chatgpt.theme?.components?.suggestion?.chip?.foreground).toBe("#ececec");
  });

  it("swaps the ChatGPT voice circle for the send on the same draft state", () => {
    const chatgpt = applyCurrentProductComposer("chatgpt", {});
    const voice = chatgpt.composer?.actions?.find(
      (action) => action.id === "voice-mode"
    );

    // The blue circle owns the slot while the draft is empty; send owns it as
    // soon as there is content, so exactly one control shows at a time.
    expect(voice?.visibility).toBe("when-empty");
    expect(voice?.kind === "button" && voice.backgroundColor).toBe("#3d68ff");
    expect(chatgpt.sendButton?.visibility).toBe("when-text");
  });

  it("paints the ChatGPT picker pill and overflow panel from composer tokens", () => {
    const chatgpt = applyCurrentProductComposer("chatgpt", {});
    const composer = chatgpt.theme?.components?.composer;

    expect(composer?.modelPicker?.background).toBe("#303030");
    expect(composer?.modelPicker?.hoverBackground).toBe("#3b3b3b");
    expect(composer?.modelPicker?.borderRadius).toBe("9999px");
    expect(composer?.overflowMenu?.background).toBe("#353535");
    expect(composer?.overflowMenu?.borderColor).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("authors the current Claude and Perplexity resting modes", () => {
    const claude = applyCurrentProductComposer("claude", {});
    const perplexity = applyCurrentProductComposer("perplexity", {});

    expect(claude.composer?.defaultActiveModeIds).toEqual(["chat"]);
    expect(claude.composer?.modeGroups?.[0]?.presentation).toBe("segmented");
    expect(claude.composer?.modelPicker).toEqual({
      presentation: "popover",
      suffix: "High",
    });
    expect(perplexity.composer?.defaultActiveModeIds).toEqual(["search"]);
    expect(perplexity.composer?.modes?.map((mode) => mode.id)).toEqual([
      "search",
      "computer",
    ]);
    // Their two pills carry their own state; the chip row stays out of it.
    expect(perplexity.composer?.modeGroups?.[0]?.chipVisibility).toBe("hidden");
  });

  it("uses the standalone Gemini and Copilot model-picker treatments", () => {
    const gemini = applyCurrentProductComposer("gemini", {});
    const copilot = applyCurrentProductComposer("copilot", {});

    expect(gemini.composer?.modelPicker?.presentation).toBe("popover");
    expect(gemini.sendButton?.visibility).toBe("when-text");
    // The closed "Pro ⌄" and the row labels sit a step below the glyph color.
    expect(gemini.theme?.components?.composer?.modelPicker?.labelColor).toBe(
      "#c4c7c5"
    );
    expect(copilot.composer?.selectedModelId).toBe("smart");
    expect(copilot.composer?.models?.[0]?.description).toBe(
      "Picks the right response style"
    );
  });

  it("opens a slash menu on the two products that have one", () => {
    const claude = applyCurrentProductComposer("claude", {});
    const chatgpt = applyCurrentProductComposer("chatgpt", {});

    for (const config of [claude, chatgpt]) {
      const mentions = config.contextMentions;
      expect(mentions?.enabled).toBe(true);
      // The `/` channel is the only live one: the implicit `@` channel carries
      // no sources and no button, so neither product grows a context menu.
      expect(mentions?.sources).toEqual([]);
      expect(mentions?.showButton).toBe(false);
      const slash = mentions?.triggers?.[0];
      expect(slash?.trigger).toBe("/");
      expect(slash?.triggerPosition).toBe("input-start");
      expect(slash?.allowSpaces).toBe(true);
      expect(slash?.showButton).toBe(false);
      expect(slash?.sources).toHaveLength(1);
    }
  });

  it("lists Claude's document skills as commands the engine can match", async () => {
    expect(CLAUDE_SKILL_COMMANDS.map((command) => command.name)).toEqual([
      "doc",
      "spreadsheet",
      "slides",
      "pdf",
    ]);
    expect(CLAUDE_SKILL_COMMANDS.map((command) => command.description)).toEqual([
      "Create a doc",
      "Create a spreadsheet",
      "Create a slide deck",
      "Create a PDF",
    ]);
    // Single-token names: the source matches on the first token of the query,
    // so a spaced name would never resolve.
    for (const command of CLAUDE_SKILL_COMMANDS) {
      expect(command.name).toMatch(/^[a-z]+$/);
      expect(command.argsPlaceholder).toBeTruthy();
    }
    // The typed argument rides the submitted prompt.
    const doc = CLAUDE_SKILL_COMMANDS[0];
    expect(typeof doc.prompt === "function" && doc.prompt("quarterly plan")).toBe(
      "Create a doc: quarterly plan"
    );

    const source = applyCurrentProductComposer("claude", {}).contextMentions
      ?.triggers?.[0]?.sources?.[0];
    expect(source?.matchCommand?.("slides")?.label).toBe("slides");
    const items = await source?.search("doc", {
      messages: [],
      config: {},
      signal: new AbortController().signal,
    });
    expect(items?.[0]?.label).toBe("doc");
  });

  it("drives ChatGPT's tool modes and slash rows from one list", () => {
    const chatgpt = applyCurrentProductComposer("chatgpt", {});

    expect(chatgpt.composer?.modes).toBe(CHATGPT_TOOL_MODES);
    expect(CHATGPT_TOOL_MODES.map((mode) => mode.id)).toEqual([
      "create-image",
      "web-search",
      "deep-research",
    ]);
    // Both menus name the same three tools with the same glyphs.
    expect(CHATGPT_TOOL_COMMANDS.map((command) => command.description)).toEqual(
      CHATGPT_TOOL_MODES.map((mode) => mode.label)
    );
    expect(CHATGPT_TOOL_COMMANDS.map((command) => command.iconName)).toEqual(
      CHATGPT_TOOL_MODES.map((mode) => mode.iconName)
    );
    expect(CHATGPT_TOOL_COMMANDS.map((command) => command.name)).toEqual([
      "image",
      "search",
      "research",
    ]);
  });
});
