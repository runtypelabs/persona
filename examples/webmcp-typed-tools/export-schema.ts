import { writeFileSync } from "node:fs";
import { cartDescriptor, checkoutDescriptor } from "./tools";

writeFileSync(new URL("./schema.json", import.meta.url), JSON.stringify({ tools: [cartDescriptor, checkoutDescriptor] }, null, 2) + "\n");
