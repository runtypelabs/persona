import { describe, expect, it } from "vitest";
import type { PersonaTheme } from "../types/theme";
import { resolveTokenValue } from "./tokens";

describe("resolveTokenValue", () => {
  it("returns undefined for direct and indirect token cycles", () => {
    const theme = {
      palette: { colors: { a: "palette.colors.b", b: "palette.colors.a" } },
    } as unknown as PersonaTheme;
    expect(resolveTokenValue(theme, "palette.colors.a")).toBeUndefined();
  });
});
