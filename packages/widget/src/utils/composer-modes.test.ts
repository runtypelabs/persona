import { describe, expect, it } from "vitest";

import type { ComposerMode, ComposerModeGroup } from "../types";
import {
  chipVisibleComposerModes,
  clearOnceComposerModes,
  hasHiddenModeChips,
  composerModeActionId,
  composerModeGroupActionId,
  composerModeOrder,
  isSegmentedModeGroup,
  pruneComposerModes,
  resolveComposerModePlaceholder,
  toggleComposerMode,
  COMPOSER_MODE_ORDER_END,
  COMPOSER_MODE_ORDER_START,
} from "./composer-modes";

const modes: ComposerMode[] = [
  { id: "search", groupId: "tool", label: "Search", placeholder: "Search the web..." },
  { id: "code", groupId: "tool", label: "Code" },
  { id: "concise", groupId: "style", label: "Concise", placeholder: "Be brief..." },
  { id: "verbose", groupId: "style", label: "Verbose" },
  { id: "draft", label: "Draft", persistence: "once" },
];

const groups: ComposerModeGroup[] = [
  { id: "tool", selection: "single" },
  { id: "style", selection: "multiple" },
];

describe("toggleComposerMode", () => {
  it("selecting in a single group deselects its siblings", () => {
    const first = toggleComposerMode([], "search", modes, groups);
    expect(first).toEqual(["search"]);
    expect(toggleComposerMode(first, "code", modes, groups)).toEqual(["code"]);
  });

  it("a multiple group stacks selections", () => {
    const first = toggleComposerMode([], "concise", modes, groups);
    expect(toggleComposerMode(first, "verbose", modes, groups)).toEqual([
      "concise",
      "verbose",
    ]);
  });

  it("a mode without a group toggles independently of every group", () => {
    const active = toggleComposerMode(["search", "concise"], "draft", modes, groups);
    expect(active).toEqual(["search", "concise", "draft"]);
  });

  it("toggling an active mode clears it", () => {
    expect(toggleComposerMode(["search"], "search", modes, groups)).toEqual([]);
  });

  it("a grouped mode with no matching group entry is independent", () => {
    const orphan: ComposerMode[] = [
      { id: "a", groupId: "ghost", label: "A" },
      { id: "b", groupId: "ghost", label: "B" },
    ];
    const active = toggleComposerMode(["a"], "b", orphan, groups);
    expect(active).toEqual(["a", "b"]);
  });

  it("returns configuration order regardless of selection order", () => {
    const active = toggleComposerMode(["verbose"], "concise", modes, groups);
    expect(active).toEqual(["concise", "verbose"]);
  });

  it("an unknown id changes nothing", () => {
    expect(toggleComposerMode(["search"], "nope", modes, groups)).toEqual(["search"]);
  });
});

describe("pruneComposerModes", () => {
  it("drops ids whose mode was removed from config", () => {
    expect(pruneComposerModes(["search", "gone"], modes)).toEqual(["search"]);
  });

  it("clears everything when modes are unconfigured", () => {
    expect(pruneComposerModes(["search"], undefined)).toEqual([]);
  });
});

describe("clearOnceComposerModes", () => {
  it("clears once modes and keeps sticky ones", () => {
    expect(clearOnceComposerModes(["search", "draft"], modes)).toEqual(["search"]);
  });

  it("treats an unspecified persistence as sticky", () => {
    expect(clearOnceComposerModes(["concise"], modes)).toEqual(["concise"]);
  });
});

describe("resolveComposerModePlaceholder", () => {
  it("the first active mode in config order wins", () => {
    expect(resolveComposerModePlaceholder(["concise", "search"], modes)).toBe(
      "Search the web..."
    );
  });

  it("skips active modes that declare no placeholder", () => {
    expect(resolveComposerModePlaceholder(["code", "concise"], modes)).toBe(
      "Be brief..."
    );
  });

  it("returns undefined when no active mode has one", () => {
    expect(resolveComposerModePlaceholder(["code", "verbose"], modes)).toBeUndefined();
    expect(resolveComposerModePlaceholder([], modes)).toBeUndefined();
  });
});

describe("segmented mode groups", () => {
  const segmented: ComposerModeGroup[] = [
    { id: "tool", selection: "single", presentation: "segmented" },
    { id: "style", selection: "multiple" },
  ];

  it("reads the presentation off the group", () => {
    expect(isSegmentedModeGroup("tool", segmented)).toBe(true);
    expect(isSegmentedModeGroup("style", segmented)).toBe(false);
    expect(isSegmentedModeGroup("tool", groups)).toBe(false);
    expect(isSegmentedModeGroup(undefined, segmented)).toBe(false);
    expect(isSegmentedModeGroup("missing", segmented)).toBe(false);
  });

  it("suppresses chips for the segmented group's modes only", () => {
    expect(chipVisibleComposerModes(modes, segmented).map((mode) => mode.id)).toEqual([
      "concise",
      "verbose",
      "draft",
    ]);
  });

  it("chips every mode when no group is segmented", () => {
    expect(chipVisibleComposerModes(modes, groups)).toHaveLength(modes.length);
    expect(chipVisibleComposerModes(modes, undefined)).toHaveLength(modes.length);
    expect(chipVisibleComposerModes(undefined, segmented)).toEqual([]);
  });
});

describe("chipVisibility on a mode group", () => {
  const hidden: ComposerModeGroup[] = [
    { id: "tool", selection: "single", chipVisibility: "hidden" },
    { id: "style", selection: "multiple", chipVisibility: "auto" },
  ];

  it("reads the opt-out off the group", () => {
    expect(hasHiddenModeChips("tool", hidden)).toBe(true);
    expect(hasHiddenModeChips("style", hidden)).toBe(false);
    expect(hasHiddenModeChips("tool", groups)).toBe(false);
    expect(hasHiddenModeChips(undefined, hidden)).toBe(false);
    expect(hasHiddenModeChips("missing", hidden)).toBe(false);
  });

  it("suppresses chips for a buttons group on the segmented pathway", () => {
    expect(chipVisibleComposerModes(modes, hidden).map((mode) => mode.id)).toEqual([
      "concise",
      "verbose",
      "draft",
    ]);
  });

  it("leaves no chip-visible mode when every group opts out", () => {
    const allHidden: ComposerModeGroup[] = [
      { id: "tool", selection: "single", chipVisibility: "hidden" },
      { id: "style", selection: "multiple", chipVisibility: "hidden" },
    ];
    const grouped = modes.filter((mode) => mode.groupId);
    expect(chipVisibleComposerModes(grouped, allHidden)).toEqual([]);
  });
});

describe("mode action identity and ordering", () => {
  it("namespaces the registry id", () => {
    expect(composerModeActionId("search")).toBe("core:mode:search");
    expect(composerModeGroupActionId("tool")).toBe("core:mode-group:tool");
  });

  it("stays inside the reserved 300-499 range", () => {
    expect(composerModeOrder(0)).toBe(COMPOSER_MODE_ORDER_START);
    expect(composerModeOrder(5)).toBe(COMPOSER_MODE_ORDER_START + 5);
    expect(composerModeOrder(9999)).toBe(COMPOSER_MODE_ORDER_END);
  });
});
