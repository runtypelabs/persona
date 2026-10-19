import type {
  LanguageModelV4,
  LanguageModelV4Message,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { z } from "zod";
import type { Ticket } from "../shared/tickets";
import { ticketService } from "./knowledge";

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const ticketResult = z.object({
  customer: z.string(),
  company: z.string(),
  category: z.string(),
  subject: z.string(),
  messages: z.array(z.object({ role: z.string(), body: z.string() })),
});
const bookResults = z.array(
  z.object({
    title: z.string(),
    steps: z.array(z.string()),
    customerReply: z.string(),
  })
);
const statusResult = z.object({
  status: z.string(),
  detail: z.string(),
  asOf: z.string(),
});

/** The answer is assembled from executed tool results, not pre-injected mock results. */
function previewAnswer(prompt: string, messages: LanguageModelV4Message[]) {
  const outputs = new Map<string, unknown>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type === "tool-result" && part.output.type === "json")
        outputs.set(part.toolName, part.output.value);
    }
  }
  const ticket = ticketResult.parse(outputs.get("read_ticket"));
  const books = bookResults.parse(outputs.get("search_runbook"));
  const status = statusResult.parse(outputs.get("check_service_status"));
  const book = books[0];
  if (!book) throw new Error("No runbook was returned.");
  const draft = /draft|reply|respond|customer-facing/i.test(prompt);
  const greeting = `Hi ${ticket.customer.split(" ")[0]},`;
  let answer: string;
  if (draft) {
    const body =
      ticket.category === "Integrations"
        ? `${status.detail}\n\n${book.customerReply}`
        : book.customerReply;
    answer = `## A reply for ${
      ticket.customer.split(" ")[0]
    }\n\n${greeting}\n\n${body}\n\nThanks for your patience,\nThe Relay team\n\n*Preview draft · Not sent. Based on fictional sample records.*`;
  } else {
    const latest =
      ticket.messages.filter((message) => message.role === "customer").at(-1)
        ?.body ?? ticket.subject;
    answer = `## Here’s what the evidence says\n\n**${ticket.company} · ${
      ticket.category
    }**\n\n${latest}\n\n### Recommended next steps\n\n${book.steps
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n")}\n\n**Service check:** ${status.detail}\n\n**Reference:** ${
      book.title
    }.\n\n*Preview investigation · Fictional ticket and runbook; service status is a sample snapshot, not a live check.*`;
  }
  return answer;
}

export function createPreviewModel(
  ticket: Ticket,
  prompt: string,
  delay = 25
): LanguageModelV4 {
  let step = 0;
  const runId = `preview-${crypto.randomUUID()}`;
  return {
    specificationVersion: "v4",
    provider: "relay-preview",
    modelId: "sample-support-investigation",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("Preview only supports streaming.");
    },
    async doStream(options) {
      const index = step++;
      const parts: LanguageModelV4StreamPart[] = [
        { type: "stream-start", warnings: [] },
      ];
      if (index === 0)
        parts.push(
          { type: "reasoning-start", id: `${runId}-summary` },
          {
            type: "reasoning-delta",
            id: `${runId}-summary`,
            delta:
              "Preview activity summary: read the selected sample ticket, find the matching support runbook, and check the bundled service-status snapshot.",
          },
          { type: "reasoning-end", id: `${runId}-summary` }
        );
      const calls = [
        { name: "read_ticket", input: {} },
        { name: "search_runbook", input: { query: ticket.category } },
        {
          name: "check_service_status",
          input: { service: ticketService(ticket) },
        },
      ];
      if (index < calls.length) {
        const call = calls[index];
        parts.push({
          type: "tool-call",
          toolCallId: `${runId}-tool-${index}`,
          toolName: call.name,
          input: JSON.stringify(call.input),
        });
      } else {
        const answer = previewAnswer(prompt, options.prompt);
        parts.push({ type: "text-start", id: `${runId}-answer` });
        for (const delta of answer.match(/.{1,42}(?:\s|$)|.{1,42}/gs) ?? [
          answer,
        ])
          parts.push({ type: "text-delta", id: `${runId}-answer`, delta });
        parts.push({ type: "text-end", id: `${runId}-answer` });
      }
      parts.push({
        type: "finish",
        finishReason: {
          unified: index < calls.length ? "tool-calls" : "stop",
          raw: index < calls.length ? "tool_calls" : "stop",
        },
        usage,
      });
      let offset = 0;
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          async pull(controller) {
            if (options.abortSignal?.aborted) {
              controller.error(options.abortSignal.reason);
              return;
            }
            if (offset >= parts.length) {
              controller.close();
              return;
            }
            if (delay)
              await new Promise((resolve) => setTimeout(resolve, delay));
            if (options.abortSignal?.aborted) {
              controller.error(options.abortSignal.reason);
              return;
            }
            controller.enqueue(parts[offset++]);
          },
        }),
      };
    },
  };
}
