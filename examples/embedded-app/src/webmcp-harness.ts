import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  DEFAULT_WIDGET_CONFIG,
  markdownPostprocessor,
  type AgentWidgetController,
  type AgentWidgetRequestPayload,
  type AgentWidgetWebMcpConfig,
  type AgentWidgetWebMcpEvent
} from "@runtypelabs/persona";

type MockCalls = {
  provideContext: number;
  registerTool: number;
  unregisterTool: number;
  clearContext: number;
};

type HarnessScenarioResult = {
  pass: boolean;
  name: string;
  details: string;
};

type MockModelContext = {
  provideContext: (...args: unknown[]) => Promise<void>;
  registerTool: (...args: unknown[]) => Promise<void>;
  unregisterTool: (...args: unknown[]) => Promise<void>;
  clearContext: (...args: unknown[]) => Promise<void>;
};

const mount = document.getElementById("webmcp-widget");
const resultsEl = document.getElementById("results");
const logEl = document.getElementById("event-log");

if (!mount || !resultsEl || !logEl) {
  throw new Error("Harness DOM nodes missing");
}

let controller: AgentWidgetController | null = null;
let lastPayload: AgentWidgetRequestPayload | null = null;
let customFetchCount = 0;

const originalModelContext = (navigator as any).modelContext;

const writeLog = (line: string) => {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

const addResult = ({ pass, name, details }: HarnessScenarioResult) => {
  const item = document.createElement("li");
  item.className = `result-item ${pass ? "pass" : "fail"}`;
  item.textContent = `${pass ? "PASS" : "FAIL"} ${name}\n${details}`;
  resultsEl.appendChild(item);
};

const createSseResponse = (assistantText: string): Response => {
  const encoder = new TextEncoder();
  const chunks = [
    `data: ${JSON.stringify({ type: "step_chunk", stepType: "prompt", text: assistantText })}\n\n`,
    `data: ${JSON.stringify({ type: "flow_complete", success: true, result: { response: assistantText } })}\n\n`
  ];
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      for (const chunk of chunks) {
        streamController.enqueue(encoder.encode(chunk));
      }
      streamController.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
};

const waitFor = async (
  condition: () => boolean,
  timeoutMs: number,
  intervalMs: number = 25
) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

const resetHarnessState = () => {
  lastPayload = null;
  customFetchCount = 0;
};

const destroyWidget = () => {
  controller?.destroy();
  controller = null;
  mount.innerHTML = "";
};

const installModelContext = (mock: MockModelContext | undefined) => {
  (navigator as any).modelContext = mock;
};

const createMockModelContext = (mode: "ready" | "error") => {
  const calls: MockCalls = {
    provideContext: 0,
    registerTool: 0,
    unregisterTool: 0,
    clearContext: 0
  };

  const modelContext: MockModelContext = {
    provideContext: async () => {
      calls.provideContext += 1;
      if (mode === "error") {
        throw new Error("mock provideContext failure");
      }
    },
    registerTool: async () => {
      calls.registerTool += 1;
    },
    unregisterTool: async () => {
      calls.unregisterTool += 1;
    },
    clearContext: async () => {
      calls.clearContext += 1;
    }
  };

  return { calls, modelContext };
};

const buildWebMcpConfig = (label: string): AgentWidgetWebMcpConfig => ({
  enabled: true,
  tools: [
    {
      name: "local_echo",
      description: "Echoes input in the browser harness",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" }
        },
        required: ["text"]
      },
      handler: async (input) => ({ ok: true, input })
    }
  ],
  onEvent: (event: AgentWidgetWebMcpEvent) => {
    writeLog(`${label} ${event.phase} ${event.status.state} ${event.status.reason ?? ""}`.trim());
  }
});

const createHarnessWidget = (label: string, webmcp: AgentWidgetWebMcpConfig) => {
  destroyWidget();
  resetHarnessState();

  controller = createAgentExperience(mount, {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: "https://harness.invalid/api/chat/dispatch",
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: false,
      width: "100%"
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "WebMCP Harness",
      welcomeSubtitle: `Scenario: ${label}`
    },
    suggestionChips: ["Run harness scenario"],
    webmcp,
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    customFetch: async (_url: string, _init: RequestInit, payload: AgentWidgetRequestPayload) => {
      customFetchCount += 1;
      lastPayload = payload;
      writeLog(`${label} request sent (state=${(payload.context as any)?.webmcp?.state ?? "none"})`);
      return createSseResponse(`Harness response for ${label}`);
    }
  });
};

const submitAndWait = async (text: string) => {
  if (!controller) throw new Error("Controller not initialized");
  const ok = controller.submitMessage(text);
  if (!ok) throw new Error("submitMessage returned false");
  await waitFor(() => controller?.getStatus() === "idle", 3000);
};

const assertScenario = (name: string, checks: Array<{ ok: boolean; message: string }>) => {
  const failing = checks.filter((check) => !check.ok);
  if (failing.length === 0) {
    addResult({
      pass: true,
      name,
      details: checks.map((check) => `- ${check.message}`).join("\n")
    });
    return;
  }
  addResult({
    pass: false,
    name,
    details: failing.map((check) => `- ${check.message}`).join("\n")
  });
};

const runUnsupported = async () => {
  const scenario = "unsupported";
  writeLog(`running ${scenario}`);
  installModelContext(undefined);
  createHarnessWidget(scenario, buildWebMcpConfig(scenario));
  await submitAndWait("run unsupported case");

  assertScenario("Unsupported fallback", [
    {
      ok: (lastPayload as any)?.context?.webmcp?.state === "unsupported",
      message: "payload.context.webmcp.state is unsupported"
    },
    {
      ok: customFetchCount === 1,
      message: "normal request path executed exactly once"
    },
    {
      ok: (controller?.getMessages() ?? []).some((m) => m.role === "assistant" && m.content.includes("Harness response")),
      message: "assistant response rendered"
    }
  ]);
};

const runReady = async () => {
  const scenario = "ready";
  writeLog(`running ${scenario}`);
  const { calls, modelContext } = createMockModelContext("ready");
  installModelContext(modelContext);
  createHarnessWidget(scenario, buildWebMcpConfig(scenario));
  await submitAndWait("run ready case");

  assertScenario("Mock ready path", [
    {
      ok: (lastPayload as any)?.context?.webmcp?.state === "ready",
      message: "payload.context.webmcp.state is ready"
    },
    {
      ok: calls.provideContext > 0,
      message: "provideContext was called"
    },
    {
      ok: calls.registerTool > 0,
      message: "registerTool was called"
    }
  ]);
};

const runError = async () => {
  const scenario = "error";
  writeLog(`running ${scenario}`);
  const { modelContext } = createMockModelContext("error");
  installModelContext(modelContext);
  createHarnessWidget(scenario, buildWebMcpConfig(scenario));
  await submitAndWait("run error case");

  assertScenario("Error fallback", [
    {
      ok: (lastPayload as any)?.context?.webmcp?.state === "error",
      message: "payload.context.webmcp.state is error"
    },
    {
      ok: customFetchCount === 1,
      message: "request still completed through fallback path"
    },
    {
      ok: (controller?.getMessages() ?? []).some((m) => m.role === "assistant"),
      message: "assistant response still rendered"
    }
  ]);
};

const runCleanup = async () => {
  const scenario = "cleanup";
  writeLog(`running ${scenario}`);
  const { calls, modelContext } = createMockModelContext("ready");
  installModelContext(modelContext);
  createHarnessWidget(scenario, buildWebMcpConfig(scenario));
  await submitAndWait("run cleanup case");
  destroyWidget();

  assertScenario("Cleanup on destroy", [
    {
      ok: calls.unregisterTool > 0,
      message: "unregisterTool was called on destroy"
    },
    {
      ok: calls.clearContext > 0,
      message: "clearContext was called on destroy"
    }
  ]);
};

const clearResults = () => {
  resultsEl.innerHTML = "";
  logEl.textContent = "";
};

document.getElementById("run-unsupported")?.addEventListener("click", () => {
  void runUnsupported().catch((error) => {
    addResult({ pass: false, name: "Unsupported fallback", details: String(error) });
  });
});

document.getElementById("run-ready")?.addEventListener("click", () => {
  void runReady().catch((error) => {
    addResult({ pass: false, name: "Mock ready path", details: String(error) });
  });
});

document.getElementById("run-error")?.addEventListener("click", () => {
  void runError().catch((error) => {
    addResult({ pass: false, name: "Error fallback", details: String(error) });
  });
});

document.getElementById("run-cleanup")?.addEventListener("click", () => {
  void runCleanup().catch((error) => {
    addResult({ pass: false, name: "Cleanup on destroy", details: String(error) });
  });
});

document.getElementById("run-all")?.addEventListener("click", () => {
  void (async () => {
    await runUnsupported();
    await runReady();
    await runError();
    await runCleanup();
  })().catch((error) => {
    addResult({ pass: false, name: "Run all", details: String(error) });
  });
});

document.getElementById("clear-results")?.addEventListener("click", clearResults);

window.addEventListener("beforeunload", () => {
  destroyWidget();
  installModelContext(originalModelContext);
});

writeLog("Harness ready");
