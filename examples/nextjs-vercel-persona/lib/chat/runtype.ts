import { buildRuntypeSystemPrompt } from "@/lib/chat/prompt";

const runtypeUpstreamUrl = "https://api.runtype.com/v1/dispatch";
const runtypeDefaultModel = "mercury-2";

type RuntypeFlowStep = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

type RuntypeFlowConfig = {
  name: string;
  description: string;
  steps: RuntypeFlowStep[];
};

export function createDemoRuntypeFlow(): RuntypeFlowConfig {
  return {
    name: "Embedded Persona Demo Assistant",
    description: "Structured JSON assistant for the generic Next.js Persona demo",
    steps: [
      {
        id: "demo_prompt",
        name: "Demo Prompt",
        type: "prompt",
        enabled: true,
        config: {
          model: process.env.RUNTYPE_MODEL || runtypeDefaultModel,
          reasoning: false,
          responseFormat: "JSON",
          outputVariable: "prompt_result",
          userPrompt: "{{user_message}}",
          systemPrompt: buildRuntypeSystemPrompt(),
          previousMessages: "{{messages}}"
        }
      }
    ]
  };
}

export async function dispatchDemoRuntypeFlow({
  apiKey,
  messages,
  inputs,
  metadata
}: {
  apiKey: string;
  messages: Array<{ role: string; content: string; createdAt?: string }>;
  inputs: Record<string, unknown>;
  metadata: Record<string, unknown>;
}) {
  const runtypePayload = {
    record: {
      name: "Embedded Persona Demo",
      type: "standalone",
      metadata
    },
    messages: messages
      .slice()
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return leftTime - rightTime;
      })
      .map((message) => ({
        role: message.role,
        content: message.content
      })),
    inputs,
    options: {
      streamResponse: true,
      recordMode: "virtual",
      flowMode: "virtual",
      autoAppendMetadata: false
    },
    flow: createDemoRuntypeFlow()
  };

  const response = await fetch(runtypeUpstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(runtypePayload)
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
