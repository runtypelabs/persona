import type { WebMCP } from "webmcp-types";
import { checkoutDescriptor } from "./tools";

export function checkSchemaInference(context: WebMCP.ModelContext) {
  return context.registerTool({
    ...checkoutDescriptor,
    execute(input) {
      const cartId: string = input.cartId;
      // @ts-expect-error -- the schema does not declare a consent argument.
      input.confirmed;
      return cartId;
    },
  });
}
