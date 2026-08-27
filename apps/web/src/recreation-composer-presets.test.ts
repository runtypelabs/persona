import { describe, expect, it } from "vitest";

import { applyCurrentProductComposer } from "./recreation-composer-presets";

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
});

