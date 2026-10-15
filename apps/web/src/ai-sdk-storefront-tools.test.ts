import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the example's actual registered callbacks and store, without mounting
// Next.js. The document registry is the only replaced boundary.
vi.mock("@mcp-b/webmcp-polyfill", () => ({ installWebMCP: () => undefined }));

type Tool = { name: string; execute(input: unknown): unknown };
let tools: Map<string, Tool>;
beforeEach(async () => {
  vi.resetModules();
  tools = new Map();
  vi.stubGlobal("document", {
    modelContext: {
      registerTool: (tool: Tool) => {
        tools.set(tool.name, tool);
      },
    },
  });
  const { registerStorefrontTools } = await import(
    "../../../examples/ai-sdk-webmcp/app/lib/webmcp-tools"
  );
  registerStorefrontTools();
});
afterEach(() => vi.unstubAllGlobals());

const call = (name: string, input: unknown) => tools.get(name)!.execute(input);

describe("AI SDK storefront quantity validation", () => {
  it.each([-1, 0, 1.5, "2", null, NaN, Infinity])(
    "rejects quantity %s without changing the cart",
    async (quantity) => {
      call("add_to_cart", { sku: "SHOE-001", quantity: 3 });
      const { cartSummary } = await import(
        "../../../examples/ai-sdk-webmcp/app/lib/store"
      );
      const before = cartSummary();
      expect(call("add_to_cart", { sku: "SHOE-001", quantity })).toMatchObject({
        isError: true,
      });
      expect(
        call("remove_from_cart", { sku: "SHOE-001", quantity })
      ).toMatchObject({ isError: true });
      expect(cartSummary()).toEqual(before);
    }
  );
  it("defaults add quantity to one and omitted remove quantity deletes the line", async () => {
    const { cartSummary } = await import(
      "../../../examples/ai-sdk-webmcp/app/lib/store"
    );
    call("add_to_cart", { sku: "SHOE-001" });
    expect(cartSummary().itemCount).toBe(1);
    call("remove_from_cart", { sku: "SHOE-001" });
    expect(cartSummary().itemCount).toBe(0);
  });
});
