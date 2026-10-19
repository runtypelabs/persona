import { Agent, getAgentByName } from "agents";
import { handleAgentRequest } from "./lib/assistant";
import { routeRequest } from "./lib/routes";

export interface Env {
  SupportAgent: DurableObjectNamespace<SupportAgent>;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}
type SupportState = { acceptedRequests: number; lastTicketId: string | null };

/** A native Cloudflare Agent Durable Object; Persona uses its HTTP/SSE surface. */
export class SupportAgent extends Agent<Env, SupportState> {
  initialState: SupportState = { acceptedRequests: 0, lastTicketId: null };
  async onRequest(request: Request): Promise<Response> {
    return handleAgentRequest(request, this.env, (dispatch) => {
      // A small durable activity counter demonstrates Agent state. Conversation history
      // remains the Persona transcript supplied on each request, not an Agent chat store.
      this.setState({
        acceptedRequests: this.state.acceptedRequests + 1,
        lastTicketId: dispatch.ticket.id,
      });
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return routeRequest(request, env, async (name, forwardedRequest) => {
      const agent = await getAgentByName(env.SupportAgent, name);
      return agent.fetch(forwardedRequest);
    });
  },
} satisfies ExportedHandler<Env>;
