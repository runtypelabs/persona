import type { AgentConfig, RuntypeFlowConfig } from "../index.js";

type PromptStepConfig = {
  model?: unknown;
  systemPrompt?: unknown;
  responseFormat?: unknown;
  reasoning?: unknown;
  temperature?: unknown;
};

export const agentFromPromptFlow = (
  flow: RuntypeFlowConfig,
  loopConfig: AgentConfig["loopConfig"],
): AgentConfig => {
  const promptStep = flow.steps.find((step) => step.enabled && step.type === "prompt");
  const config = promptStep?.config as PromptStepConfig | undefined;

  if (
    !promptStep ||
    typeof config?.model !== "string" ||
    typeof config.systemPrompt !== "string"
  ) {
    throw new Error(`Cannot derive an agent config from flow "${flow.name}".`);
  }

  return {
    name: flow.name.replace(/\s+Flow$/, " Agent"),
    model: config.model,
    systemPrompt: config.systemPrompt,
    ...(typeof config.responseFormat === "string" && {
      responseFormat: config.responseFormat,
    }),
    ...(typeof config.reasoning === "boolean" && { reasoning: config.reasoning }),
    ...(typeof config.temperature === "number" && {
      temperature: config.temperature,
    }),
    ...(loopConfig && { loopConfig }),
  };
};
