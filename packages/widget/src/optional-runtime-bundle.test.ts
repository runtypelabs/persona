import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dist = (name: string) => resolve(__dirname, "../dist", name);
const built = existsSync(dist("index.global.js"));
const boundaries = [
  ["dictation-runtime.js", "data-persona-dictation-waveform"],
  ["composer-actions-runtime.js", "data-persona-menu-description-layout"],
  ["client-dispatch.js", "CSAT rating must be between 1 and 5"],
  ["config-diagnostics.js", "welcome.title (the new welcome value wins)"],
] as const;

describe("optional runtime bundle boundaries", () => {
  it.runIf(built).each(boundaries)("keeps %s implementation outside the CDN core", (name, marker) => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    expect(core).toContain(name);
    expect(core).not.toContain(marker);
    expect(readFileSync(dist(name), "utf8")).toContain(marker);
  });

  it.runIf(built)("keeps initialized activity services out of the separate whole-turn bundle", () => {
    // Each entry bundles its own module state. The turn renderer must receive
    // initialized services from activity-ui rather than copy its empty bridge.
    expect(readFileSync(dist("activity-ui.js"), "utf8")).toContain("Activity UI requires core style dependencies.");
    expect(readFileSync(dist("turn-activity-ui.js"), "utf8")).not.toContain("Activity UI requires core style dependencies.");
  });

  it.runIf(built)("reuses core icon/tooltip services in controls and dictation", () => {
    for (const name of ["composer-actions-runtime.js", "dictation-runtime.js", "activity-ui.js"]) {
      const code = readFileSync(dist(name), "utf8");
      expect(code).not.toContain("clipboard-copy");
      expect(code).not.toContain('className="persona-tooltip"');
    }
  });
});
