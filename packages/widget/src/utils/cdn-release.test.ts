import { describe, expect, it } from "vitest";
import { version } from "../../package.json";
import { pinCdnRelease } from "./cdn-release";

describe("pinCdnRelease", () => {
  it.each(["install", "index", "launcher"])("pins the %s entry's dependencies to its embedded release", (entry) => {
    expect(pinCdnRelease(`https://cdn.runtype.com/persona/latest/${entry}.global.js?embed=1`))
      .toBe(`https://cdn.runtype.com/persona/${version}/${entry}.global.js?embed=1`);
  });

  it.each([
    "https://cdn.runtype.com/persona/4.0.0/index.global.js",
    "https://cdn.example.com/persona/latest/index.global.js",
    "https://cdn.jsdelivr.net/npm/@runtypelabs/persona@4/dist/index.global.js",
    "https://cdn.runtype.com/other/latest/index.global.js",
    "",
  ])("preserves explicit versions and other hosting layouts: %s", (src) => {
    expect(pinCdnRelease(src)).toBe(src);
  });
});
