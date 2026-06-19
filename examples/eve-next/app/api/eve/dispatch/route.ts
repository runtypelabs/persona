import { createEvePersonaHandler } from "../../../lib/eve-adapter";
import {
  personaMessagesToChat,
  type PersonaDispatchBody,
} from "../../../lib/persona-wire";

export const runtime = "nodejs";

export const POST = createEvePersonaHandler({
  host: process.env.EVE_HOST,
  getMessages(body) {
    return personaMessagesToChat((body as PersonaDispatchBody).messages);
  },
});
