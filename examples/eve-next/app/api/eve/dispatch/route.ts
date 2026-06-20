import { createEvePersonaHandler } from "../../../lib/eve-adapter";
import {
  personaMessagesToChat,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

// No `host`: the adapter resolves the eve base URL from EVE_BASE_URL or, by
// default, the request origin — which `withEve()` proxies to the eve agent it
// launched alongside `next dev`.
export const POST = createEvePersonaHandler({
  getMessages(body) {
    return personaMessagesToChat((body as PersonaDispatchBody).messages);
  },
});
