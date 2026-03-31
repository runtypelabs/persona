import { streamText } from "ai";

import {
  createPersonaTextStreamResponse,
  personaSseHeaders
} from "@/lib/chat/persona-sse";
import { buildGatewayPrompt, type PersonaPromptContext } from "@/lib/chat/prompt";
import { resolvePersonaBackend } from "@/lib/chat/provider";
import { dispatchDemoRuntypeFlow } from "@/lib/chat/runtype";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: string;
  content: string;
  createdAt?: string;
};

type ChatDispatchRequest = {
  messages?: ChatMessage[];
  metadata?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function normalizePromptContext(body: ChatDispatchRequest): PersonaPromptContext {
  const source = (isRecord(body.inputs) ? body.inputs : body.metadata) ?? {};

  return {
    pageTitle: asString(source.pageTitle),
    pagePath: asString(source.pagePath),
    pageContext: asString(source.pageContext),
    sourceData: asRecord(source.sourceData),
    formSummary: asRecord(source.formSummary),
    capabilities: asRecord(source.capabilities),
    lastLocalActionResult: asRecord(source.lastLocalActionResult) ?? null
  };
}

function normalizeMessages(messages: ChatMessage[] | undefined) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(
      (message): message is ChatMessage =>
        typeof message?.role === "string" && typeof message?.content === "string"
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt
    }));
}

function buildRuntypeInputs(context: PersonaPromptContext) {
  return {
    pageTitle: context.pageTitle ?? "Unknown",
    pagePath: context.pagePath ?? "Unknown",
    pageContext: context.pageContext ?? "Unavailable",
    sourceDataJson: JSON.stringify(context.sourceData ?? {}, null, 2),
    formSummaryJson: JSON.stringify(context.formSummary ?? {}, null, 2),
    capabilitiesJson: JSON.stringify(context.capabilities ?? {}, null, 2),
    lastLocalActionResultJson: JSON.stringify(
      context.lastLocalActionResult ?? {},
      null,
      2
    )
  };
}

export async function POST(request: Request) {
  const resolvedBackend = resolvePersonaBackend(process.env);
  if (!resolvedBackend.ok) {
    return Response.json({ error: resolvedBackend.error }, { status: 500 });
  }

  let body: ChatDispatchRequest;
  try {
    body = (await request.json()) as ChatDispatchRequest;
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return Response.json(
      { error: "Expected at least one chat message" },
      { status: 400 }
    );
  }

  const promptContext = normalizePromptContext(body);

  if (resolvedBackend.backend === "runtype") {
    if (!process.env.RUNTYPE_API_KEY) {
      return Response.json(
        { error: "Missing RUNTYPE_API_KEY for runtype mode" },
        { status: 500 }
      );
    }

    return dispatchDemoRuntypeFlow({
      apiKey: process.env.RUNTYPE_API_KEY,
      messages,
      inputs: buildRuntypeInputs(promptContext),
      metadata: {
        ...buildRuntypeInputs(promptContext),
        backend: "runtype"
      }
    });
  }

  try {
    const result = streamText({
      model: resolvedBackend.model,
      temperature: 0.2,
      prompt: buildGatewayPrompt(messages, promptContext)
    });

    return createPersonaTextStreamResponse(result.textStream);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "AI Gateway request failed"
      }),
      {
        status: 500,
        headers: {
          ...personaSseHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
}
