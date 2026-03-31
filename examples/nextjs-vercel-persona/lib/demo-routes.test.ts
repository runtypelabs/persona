import { describe, expect, it } from "vitest";

import {
  demoRoutes,
  getRouteIdFromPathname,
  resolveDemoRoute
} from "@/lib/demo-routes";

describe("demo route resolution", () => {
  it("resolves allowlisted route IDs to same-origin paths", () => {
    expect(resolveDemoRoute("home")).toBe(demoRoutes.home.path);
    expect(resolveDemoRoute("demo_form")).toBe(demoRoutes.demo_form.path);
  });

  it("rejects unknown route IDs", () => {
    expect(resolveDemoRoute("https://example.com")).toBeNull();
    expect(resolveDemoRoute("admin")).toBeNull();
  });

  it("maps known paths back to route IDs", () => {
    expect(getRouteIdFromPathname(demoRoutes.home.path)).toBe("home");
    expect(getRouteIdFromPathname(demoRoutes.demo_form.path)).toBe("demo_form");
    expect(getRouteIdFromPathname("/unknown")).toBeNull();
  });
});
