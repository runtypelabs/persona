import { describe, expect, it } from "vitest";

import { resolveContentMaxWidth } from "./content-width";
import type { AgentWidgetConfig } from "../types";

const cfg = (value?: Partial<AgentWidgetConfig>) =>
  value as AgentWidgetConfig | undefined;

describe("resolveContentMaxWidth", () => {
  it("defaults panels to the surveyed 768px column", () => {
    expect(resolveContentMaxWidth(cfg({}), false)).toBe("768px");
    expect(resolveContentMaxWidth(undefined, false)).toBe("768px");
  });

  it("keeps the composer-bar's own 720px fallback", () => {
    expect(resolveContentMaxWidth(cfg({}), true)).toBe("720px");
  });

  it("lets layout.contentMaxWidth win everywhere", () => {
    const config = cfg({ layout: { contentMaxWidth: "90ch" } });
    expect(resolveContentMaxWidth(config, false)).toBe("90ch");
    expect(resolveContentMaxWidth(config, true)).toBe("90ch");
  });

  it("passes the \"none\" opt-out through untouched", () => {
    expect(
      resolveContentMaxWidth(cfg({ layout: { contentMaxWidth: "none" } }), false)
    ).toBe("none");
  });

  it("prefers composerBar.contentMaxWidth over the 720px fallback", () => {
    const config = cfg({
      launcher: { composerBar: { contentMaxWidth: "600px" } },
    });
    expect(resolveContentMaxWidth(config, true)).toBe("600px");
  });
});
