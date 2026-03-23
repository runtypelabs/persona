import { describe, it, expect } from "vitest";

describe("prototype pollution guard", () => {
  it("strips __proto__, constructor, and prototype from parsed config", () => {
    // Simulates the destructuring pattern used in install.ts
    const malicious = JSON.parse(
      '{"config":{"apiUrl":"http://localhost"},"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}'
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { __proto__: _a, constructor: _b, prototype: _c, ...safeConfig } = malicious;

    const target: Record<string, unknown> = {};
    Object.assign(target, safeConfig);

    // The dangerous keys should not be on the target
    expect(Object.keys(target)).toEqual(["config"]);
    expect((target as any).__proto__).toBe(Object.prototype); // normal prototype, not polluted
    expect((target as any).constructor).toBe(Object); // normal constructor

    // Global prototype should not be polluted
    expect(({} as any).polluted).toBeUndefined();
  });

  it("preserves safe config properties", () => {
    const parsed = JSON.parse(
      '{"config":{"apiUrl":"http://localhost"},"clientToken":"tok_123","flowId":"flow-1"}'
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { __proto__: _a, constructor: _b, prototype: _c, ...safeConfig } = parsed;

    expect(safeConfig).toEqual({
      config: { apiUrl: "http://localhost" },
      clientToken: "tok_123",
      flowId: "flow-1",
    });
  });
});
