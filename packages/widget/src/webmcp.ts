import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetWebMcpConfig,
  AgentWidgetWebMcpEvent,
  AgentWidgetWebMcpStatus,
  AgentWidgetWebMcpToolDefinition
} from "./types";

type ModelContextLike = {
  provideContext?: (...args: any[]) => unknown;
  clearContext?: (...args: any[]) => unknown;
  registerTool?: (...args: any[]) => unknown;
  unregisterTool?: (...args: any[]) => unknown;
};

const DEFAULT_MAX_CONTEXT_MESSAGES = 20;

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

const getModelContext = (): ModelContextLike | null => {
  if (typeof navigator === "undefined") return null;
  const modelContext = (navigator as any).modelContext;
  if (!modelContext || typeof modelContext !== "object") return null;
  return modelContext as ModelContextLike;
};

const toToolSummary = (tools: AgentWidgetWebMcpToolDefinition[]) =>
  tools.map((tool) => tool.name);

export class WebMcpRuntime {
  private status: AgentWidgetWebMcpStatus;
  private readonly registeredTools = new Set<string>();
  private initialized = false;
  private disabledAfterError = false;
  private currentMessages: AgentWidgetMessage[] = [];
  private currentSignal?: AbortSignal;

  constructor(
    private readonly config: AgentWidgetWebMcpConfig,
    private readonly widgetConfig: AgentWidgetConfig
  ) {
    this.status = config.enabled
      ? { state: "unsupported", reason: "not_checked" }
      : { state: "disabled", reason: "webmcp_not_enabled" };
  }

  public getStatus(): AgentWidgetWebMcpStatus {
    return { ...this.status, registeredTools: [...this.registeredTools] };
  }

  public async sync(
    messages: AgentWidgetMessage[],
    signal?: AbortSignal
  ): Promise<AgentWidgetWebMcpStatus> {
    if (!this.config.enabled) {
      this.status = { state: "disabled", reason: "webmcp_not_enabled" };
      return this.getStatus();
    }
    if (this.disabledAfterError) {
      return this.getStatus();
    }
    if (signal?.aborted) {
      return this.getStatus();
    }

    const modelContext = getModelContext();
    if (!modelContext) {
      this.status = {
        state: "unsupported",
        reason: "navigator.modelContext_unavailable"
      };
      this.emit("detect", this.getStatus());
      return this.getStatus();
    }

    this.emit("detect", {
      state: "ready",
      reason: "navigator.modelContext_detected",
      registeredTools: [...this.registeredTools]
    });

    this.currentMessages = messages;
    this.currentSignal = signal;

    try {
      const isFirstSync = !this.initialized;
      await this.syncContext(modelContext, messages);
      await this.syncTools(modelContext, signal);
      this.initialized = true;
      this.status = {
        state: "ready",
        reason: "webmcp_active",
        registeredTools: [...this.registeredTools]
      };
      this.emit(isFirstSync ? "init" : "context", this.getStatus());
      return this.getStatus();
    } catch (error) {
      const err = asError(error);
      this.status = {
        state: "error",
        reason: "webmcp_sync_failed",
        details: err.message,
        registeredTools: [...this.registeredTools]
      };
      this.disabledAfterError = true;
      this.emit("init", this.getStatus(), err);
      return this.getStatus();
    }
  }

  public async dispose(): Promise<void> {
    if (!this.config.enabled) return;
    const modelContext = getModelContext();
    if (!modelContext) return;

    const toolNames = [...this.registeredTools];
    for (const name of toolNames) {
      try {
        await this.tryUnregisterTool(modelContext, name);
      } catch (error) {
        this.emit("dispose", this.getStatus(), asError(error), name);
      }
    }
    this.registeredTools.clear();

    try {
      if (typeof modelContext.clearContext === "function") {
        await Promise.resolve(modelContext.clearContext());
      }
    } catch (error) {
      this.emit("dispose", this.getStatus(), asError(error));
    }
  }

  private emit(
    phase: AgentWidgetWebMcpEvent["phase"],
    status: AgentWidgetWebMcpStatus,
    error?: Error,
    toolName?: string
  ) {
    this.config.onEvent?.({ phase, status, error, toolName });
  }

  private async syncContext(
    modelContext: ModelContextLike,
    messages: AgentWidgetMessage[]
  ) {
    if (typeof modelContext.provideContext !== "function") return;

    const provided =
      (await this.config.contextProvider?.({
        messages,
        config: this.widgetConfig
      })) ?? this.buildDefaultContext(messages);

    const provideContext = modelContext.provideContext.bind(modelContext);
    const payload = provided && typeof provided === "object" ? provided : {};
    await this.tryProvideContext(provideContext, payload);
    this.emit("context", this.getStatus());
  }

  private async syncTools(
    modelContext: ModelContextLike,
    signal?: AbortSignal
  ) {
    if (typeof modelContext.registerTool !== "function") return;
    const tools = this.config.tools ?? [];
    for (const tool of tools) {
      if (signal?.aborted) return;
      if (this.registeredTools.has(tool.name)) continue;
      await this.tryRegisterTool(modelContext, tool);
      this.registeredTools.add(tool.name);
      this.emit("tool-register", {
        state: "ready",
        reason: "tool_registered",
        registeredTools: [...this.registeredTools]
      }, undefined, tool.name);
    }
  }

  private async tryProvideContext(
    provideContext: (...args: any[]) => unknown,
    payload: Record<string, unknown>
  ) {
    const attempts: Array<() => Promise<unknown>> = [
      () => Promise.resolve(provideContext(payload)),
      () => Promise.resolve(provideContext("persona", payload))
    ];
    let lastError: Error | null = null;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = asError(error);
      }
    }
    if (lastError) {
      throw lastError;
    }
  }

  private async tryRegisterTool(
    modelContext: ModelContextLike,
    tool: AgentWidgetWebMcpToolDefinition
  ) {
    const registerTool = modelContext.registerTool!.bind(modelContext);
    const definition = {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {})
    };

    const handler = async (input: unknown) => {
      if (!tool.handler) {
        return { ok: false, error: "No tool handler configured" };
      }
      return tool.handler(input, {
        messages: this.currentMessages,
        config: this.widgetConfig,
        signal: this.currentSignal
      });
    };

    const attempts: Array<() => Promise<unknown>> = [
      () => Promise.resolve(registerTool(definition, handler)),
      () => Promise.resolve(registerTool(tool.name, definition, handler)),
      () => Promise.resolve(registerTool(tool.name, handler))
    ];

    let lastError: Error | null = null;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = asError(error);
      }
    }
    if (lastError) {
      throw lastError;
    }
  }

  private async tryUnregisterTool(modelContext: ModelContextLike, name: string) {
    if (typeof modelContext.unregisterTool !== "function") return;
    const unregisterTool = modelContext.unregisterTool.bind(modelContext);
    const attempts: Array<() => Promise<unknown>> = [
      () => Promise.resolve(unregisterTool(name)),
      () => Promise.resolve(unregisterTool({ name }))
    ];

    let lastError: Error | null = null;
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch (error) {
        lastError = asError(error);
      }
    }
    if (lastError) {
      throw lastError;
    }
  }

  private buildDefaultContext(messages: AgentWidgetMessage[]) {
    const maxMessages = this.config.maxContextMessages ?? DEFAULT_MAX_CONTEXT_MESSAGES;
    const recent = messages.slice(-maxMessages).map((message) => ({
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
      content: message.llmContent ?? message.rawContent ?? message.content
    }));
    return {
      source: "persona-widget",
      messages: recent,
      registeredTools: toToolSummary(this.config.tools ?? [])
    };
  }
}
