// @vitest-environment jsdom

/**
 * Transport test for the lazy animations-extra chunk.
 *
 * The chunk is bundled `noExternal`, so its import-time self-registration of
 * wipe/glyph-cycle lands in the CHUNK'S OWN copy of the stream-animation
 * registry — invisible to core's resolver. ui.ts must therefore register the
 * module's exported plugin objects into core's registry explicitly. The fake
 * module below has NO side effects, mimicking the isolated-copy scenario: if
 * ui.ts ever regresses to relying on the chunk's self-registration, this fails.
 * (Caught originally in a real-browser check, not by unit tests — vitest
 * shares one module instance, which hides the dual-copy failure mode.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import {
  setAnimationsExtraLoader,
  type AnimationsExtraModule,
} from "./animations-extra-loader";
import { resolveStreamAnimationPlugin } from "./utils/stream-animation";
import type { StreamAnimationPlugin } from "./types";

const fakeWipe: StreamAnimationPlugin = {
  name: "wipe",
  containerClass: "persona-stream-wipe",
  wrap: "word",
  styles: "/* fake wipe styles */",
};
const fakeGlyphCycle: StreamAnimationPlugin = {
  name: "glyph-cycle",
  containerClass: "persona-stream-glyph-cycle",
  wrap: "char",
};

describe("animations-extra chunk transport", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("registers the chunk's plugins into CORE's registry (no reliance on chunk self-registration)", async () => {
    // Side-effect-free module: registration must come from ui.ts.
    setAnimationsExtraLoader(() =>
      Promise.resolve({
        wipe: fakeWipe,
        glyphCycle: fakeGlyphCycle,
      } as AnimationsExtraModule)
    );

    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { streamAnimation: { type: "wipe" } },
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    // Init resolves "wipe", misses, and kicks the chunk load.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Core's resolver must now return the module's plugin object itself.
    expect(resolveStreamAnimationPlugin("wipe")).toBe(fakeWipe);
    expect(resolveStreamAnimationPlugin("glyph-cycle")).toBe(fakeGlyphCycle);

    controller.destroy();
  });
});
