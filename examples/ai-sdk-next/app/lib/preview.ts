/** Deterministic sample data. This route never contacts a model or external service. */
import type { LanguageModelV4, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { tool } from "ai";
import OpenAI from "openai";
import { z } from "zod";
import { createAISDKPersonaHandler } from "./ai-sdk-adapter";
import { createOpenAIResponsesPersonaHandler } from "./openai-responses-adapter";
import { personaMessagesToModelMessages, personaMessagesToOpenAIInput, type PersonaDispatchBody } from "./persona-wire";

const sample = {
  audience: "Small product teams launching their first collaborative workspace",
  signals: ["Early users value a fast first win", "Personal invitations outperform broad announcements", "A clear example makes an unfamiliar product easier to try"],
  plan: ["Invite 20 design partners", "Publish one useful example", "Open a small public beta", "Review activation after one week"],
};

export function previewAnswer(prompt: string): string {
  if (/checklist|steps|plan/i.test(prompt)) return "## A launch you can learn from\n\nStart small, make the first experience useful, and leave room to listen.\n\n- **Before launch:** Invite 20 design partners and define one clear activation milestone.\n- **Launch day:** Share a working example, a concise introduction, and one way to try the product.\n- **Week one:** Talk to five new users. Fix the first point of friction before adding more traffic.\n\n**Your next move:** Write the invitation you would send to your first design partner.\n\n*Based on the preview’s sample launch brief, not live research.*";
  if (/compare|strateg/i.test(prompt)) return "## Three ways to make your first impression\n\n| Approach | Best for | Trade-off |\n| --- | --- | --- |\n| Design partners | Learning quickly | Smaller initial reach |\n| Public beta | Testing demand | More support and feedback noise |\n| Content-led launch | Building trust | Slower initial momentum |\n\n**I’d start with design partners.** A small group gives you enough signal to improve the experience before a wider launch. Pair it with one practical, shareable example.\n\n*This comparison uses sample data from the preview.*";
  return "## Start with a smaller, better launch.\n\nThe sample research points to a simple opportunity: help a small group of people reach their first useful result, then let that experience tell your story.\n\n### A focused path forward\n\n1. **Find your first 20 people.** Invite a specific audience with a problem you understand.\n2. **Show one real use case.** A working example says more than a feature list.\n3. **Learn before you scale.** Review first-week activation and talk to people who got stuck.\n\n**The takeaway:** Make the first five minutes feel valuable. A thoughtful invitation and one excellent example are a strong place to begin.\n\n*Illustrative findings from the preview’s sample launch brief; no live research was performed.*";
}

function latestPrompt(body: PersonaDispatchBody) {
  return personaMessagesToModelMessages(body.messages).reverse().find(message => message.role === "user")?.content.toString() ?? "Research a thoughtful product launch";
}

const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
function previewModel(answer: string, delay: number): LanguageModelV4 {
  let step = 0;
  return {
    specificationVersion: "v4", provider: "persona-preview", modelId: "sample-launch-research", supportedUrls: {},
    async doGenerate() { throw new Error("The preview model only supports streaming."); },
    async doStream({ abortSignal }) {
      const index = step++;
      const chunks: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }];
      if (index === 0) chunks.push({ type: "reasoning-start", id: "preview-reasoning" }, { type: "reasoning-delta", id: "preview-reasoning", delta: "I’ll review the sample audience notes, read the launch brief, and organize a practical recommendation." }, { type: "reasoning-end", id: "preview-reasoning" });
      const names = ["search_docs", "read_document", "check_readiness"];
      if (index < names.length) {
        chunks.push({ type: "tool-call", toolCallId: `preview-tool-${index}`, toolName: names[index], input: JSON.stringify({ topic: ["Audience research", "Launch brief", "Launch readiness"][index] }) });
      } else {
        chunks.push({ type: "text-start", id: "preview-answer" });
        for (const delta of answer.match(/.{1,38}(?:\s|$)|.{1,38}/gs) ?? [answer]) chunks.push({ type: "text-delta", id: "preview-answer", delta });
        chunks.push({ type: "text-end", id: "preview-answer" });
      }
      chunks.push({ type: "finish", finishReason: { unified: index < names.length ? "tool-calls" : "stop", raw: index < names.length ? "tool_calls" : "stop" }, usage });
      let offset = 0;
      return { stream: new ReadableStream<LanguageModelV4StreamPart>({ async pull(controller) {
        if (abortSignal?.aborted) { controller.error(abortSignal.reason); return; }
        if (offset >= chunks.length) { controller.close(); return; }
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (abortSignal?.aborted) { controller.error(abortSignal.reason); return; }
        controller.enqueue(chunks[offset++]);
      } }) };
    },
  };
}

/** Exercises streamText, tool execution, continuation, and the production wire adapter. */
export function createPreviewHandler({ delay = 55 }: { delay?: number } = {}) {
  return async (request: Request) => {
    const body = await request.clone().json() as PersonaDispatchBody;
    const answer = previewAnswer(latestPrompt(body));
    const schema = z.object({ topic: z.string() });
    return createAISDKPersonaHandler({
      model: previewModel(answer, delay), maxSteps: 4,
      tools: {
        search_docs: tool({ description: "Search the bundled sample audience notes.", inputSchema: schema, execute: async () => ({ source: "Sample audience notes", signals: sample.signals }) }),
        read_document: tool({ description: "Read the bundled sample launch brief.", inputSchema: schema, execute: async () => ({ source: "Sample launch brief", audience: sample.audience, plan: sample.plan }) }),
        check_readiness: tool({ description: "Evaluate the sample launch checklist in memory; no shell commands run.", inputSchema: schema, execute: async () => ({ checks: [{ name: "Audience defined", ready: true }, { name: "First-use example", ready: true }, { name: "Feedback loop", ready: true }] }) }),
      },
      getMessages: value => personaMessagesToModelMessages((value as PersonaDispatchBody).messages),
    })(request);
  };
}

/** The official OpenAI SDK parses an in-memory Responses event stream, with no network. */
export function createResponsesPreviewHandler({ delay = 55 }: { delay?: number } = {}) {
  return async (request: Request) => {
    const body = await request.clone().json() as PersonaDispatchBody;
    const answer = previewAnswer(latestPrompt(body));
    const events: Record<string, unknown>[] = [];
    const add = (type: string, value: Record<string, unknown>) => events.push({ type, sequence_number: events.length, ...value });
    add("response.output_item.added", { output_index: 0, item: { id: "preview-progress", type: "message", role: "assistant", phase: "commentary", content: [], status: "in_progress" } });
    add("response.output_text.delta", { item_id: "preview-progress", output_index: 0, content_index: 0, delta: "I’ll review the sample research and launch brief before making a recommendation." });
    add("response.output_item.done", { output_index: 0, item: { id: "preview-progress", type: "message", role: "assistant", phase: "commentary", content: [], status: "completed" } });
    for (let index = 0; index < 3; index++) {
      const item = { id: `preview-search-${index}`, type: "web_search_call", action: { type: "search", query: ["Sample audience notes", "Sample launch brief", "Sample readiness checklist"][index] } };
      add("response.output_item.added", { output_index: index + 1, item: { ...item, status: "in_progress" } });
      add("response.output_item.done", { output_index: index + 1, item: { ...item, status: "completed" } });
    }
    add("response.output_item.added", { output_index: 4, item: { id: "preview-final", type: "message", role: "assistant", phase: "final_answer", content: [], status: "in_progress" } });
    for (const delta of answer.match(/.{1,38}(?:\s|$)|.{1,38}/gs) ?? [answer]) add("response.output_text.delta", { item_id: "preview-final", output_index: 4, content_index: 0, delta });
    add("response.output_item.done", { output_index: 4, item: { id: "preview-final", type: "message", role: "assistant", phase: "final_answer", content: [], status: "completed" } });
    add("response.completed", { response: { id: "preview-response", status: "completed" } });
    const client = new OpenAI({ apiKey: "local-preview-no-credentials", maxRetries: 0, fetch: async () => {
      const encoder = new TextEncoder();
      let offset = 0;
      return new Response(new ReadableStream({ async pull(controller) {
        if (request.signal.aborted) { controller.error(request.signal.reason); return; }
        if (offset >= events.length) { controller.close(); return; }
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const event = events[offset++];
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      } }), { headers: { "content-type": "text/event-stream" } });
    } });
    return createOpenAIResponsesPersonaHandler({ client, model: "local-preview", getInput: value => personaMessagesToOpenAIInput((value as PersonaDispatchBody).messages) })(request);
  };
}
