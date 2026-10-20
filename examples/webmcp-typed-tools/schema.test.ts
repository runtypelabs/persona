import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { cartDescriptor, checkoutDescriptor } from "./tools";

it("keeps the model evaluation schema aligned with the registered descriptors", () => {
  const schema = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8"));
  expect(schema).toEqual({ tools: [cartDescriptor, checkoutDescriptor] });
});
