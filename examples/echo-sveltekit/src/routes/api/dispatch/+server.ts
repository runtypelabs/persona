import type { RequestHandler } from "./$types";
import { createEchoPersonaHandler /*, openAiResponder */ } from "$lib/echo-adapter";

// The canonical adapter: a plain Web `(Request) => Promise<Response>`. To stream
// a real model, set OPENAI_API_KEY and swap in:
//   createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })
const dispatch = createEchoPersonaHandler();

// SvelteKit hands us a Web `Request` and accepts a Web `Response`, so the entire
// "bridge" is to return what the handler returns, identical to Hono. Contrast
// with the Express / bare-Node hosts, which must adapt the `(req, res)` callback
// style by hand.
export const POST: RequestHandler = ({ request }) => dispatch(request);
