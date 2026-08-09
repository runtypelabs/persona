import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  ComposerActionOverflowConfig,
  ComposerMode,
  ComposerModeGroup,
} from "./index-core";

/**
 * The composer roadmap's config types have to be nameable from the package
 * entry, not just from `types.ts`: a host writing `composer.modes` in its own
 * module needs the annotation. These three were reachable through
 * `AgentWidgetComposerConfig` but not exported on their own.
 */
const source = readFileSync(
  fileURLToPath(new URL("./index-core.ts", import.meta.url)),
  "utf-8",
);

describe("index-core composer type exports", () => {
  it.each([
    "ComposerMode",
    "ComposerModeGroup",
    "ComposerActionOverflowConfig",
  ])("re-exports %s from the package entry", (name) => {
    expect(source).toMatch(new RegExp(`^\\s*${name},\\s*$`, "m"));
  });

  it("keeps the exported names usable as annotations", () => {
    const groups: ComposerModeGroup[] = [{ id: "style", selection: "single" }];
    const modes: ComposerMode[] = [
      { id: "concise", groupId: "style", label: "Concise" },
    ];
    const overflow: ComposerActionOverflowConfig = {
      enabled: true,
      collapseAutoActionsBelow: 520,
    };

    expect(modes[0].groupId).toBe(groups[0].id);
    expect(overflow.enabled).toBe(true);
  });
});
