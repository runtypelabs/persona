import type {
  ClientToolCallFrame,
  ClientToolDefinition,
  ClientToolsFrame,
  VoiceClientToolOutcome,
  VoiceClientTools,
  VoiceClientToolsChannel,
  VoiceClientToolsSession,
} from "../types";

const WEBMCP_PREFIX = "webmcp:";

/** The name the server calls a client tool back with: `webmcp:` prefixed for page tools. */
export function voiceClientToolName(tool: ClientToolDefinition): string {
  return tool.origin === "webmcp" && !tool.name.startsWith(WEBMCP_PREFIX) ? WEBMCP_PREFIX + tool.name : tool.name;
}

// Page-wide, never reset: every `client_tools` frame's revision is larger than the last.
let lastRevision = 0;

/**
 * The fast-tier half of a voice call (see runtype-voice-provider.ts): keeps the
 * server's `client_tools` snapshot current and answers each `client_tool_call`
 * with exactly one `client_tool_result`. Ships in the lazy
 * `voice-client-tools` chunk, loaded only when the server negotiates it.
 */
export function createVoiceClientToolsSession(
  surface: VoiceClientTools,
  channel: VoiceClientToolsChannel,
): VoiceClientToolsSession {
  let closed = false;
  let queue = Promise.resolve();
  let sentRevision: number | null = null;
  let sentFingerprint: string | null = null;
  let sent = new Map<string, ClientToolDefinition>();
  const calls = new Map<string, { delegationId: string; abort: AbortController }>();

  // Serialized, so revisions go out in order; only a changed fingerprint is resent.
  const sync = () => {
    queue = queue.then(async () => {
      const snapshot = closed ? null : await surface.snapshot().catch(() => null);
      if (!snapshot || closed || snapshot.fingerprint === sentFingerprint) return;
      const tools = snapshot.tools.map((tool) => ({ ...tool, name: voiceClientToolName(tool) }));
      const frame: ClientToolsFrame = { type: "client_tools", revision: lastRevision + 1, tools };
      if (!channel.send(frame)) return;
      lastRevision = sentRevision = frame.revision;
      sentFingerprint = snapshot.fingerprint;
      sent = new Map(tools.map((tool) => [tool.name, tool]));
    });
  };

  const abort = (delegationId?: string) => {
    for (const [id, call] of calls) {
      if (delegationId !== undefined && call.delegationId !== delegationId) continue;
      calls.delete(id);
      call.abort.abort();
    }
  };

  const stopWatch = surface.onChange(sync);
  sync();

  return {
    abort,
    close() {
      closed = true;
      stopWatch();
      abort();
    },
    call(msg: Partial<ClientToolCallFrame>) {
      const { delegationId, toolCallId } = msg;
      if (closed || typeof delegationId !== "string" || !delegationId || typeof toolCallId !== "string" || !toolCallId)
        return;
      const controller = new AbortController();
      calls.get(toolCallId)?.abort.abort();
      calls.set(toolCallId, { delegationId, abort: controller });
      // Exactly one answer, unless the call was aborted (cancelled, handed back, hang-up).
      const reply = ({ status, result, error }: VoiceClientToolOutcome) => {
        const owned = calls.get(toolCallId)?.abort === controller;
        calls.delete(toolCallId);
        if (!owned || closed || channel.cancelled(delegationId)) return;
        channel.send({
          type: "client_tool_result",
          delegationId,
          toolCallId,
          status,
          ...(result !== undefined && { result }),
          ...(error && { error: { message: error.message } }),
        });
      };

      const name = typeof msg.name === "string" ? msg.name : "";
      const tool = sent.get(name) ?? sent.get(WEBMCP_PREFIX + name);
      if (!tool || msg.revision !== sentRevision) {
        return reply({ status: "stale", error: { message: tool ? `Revision ${msg.revision} is stale.` : `Unknown tool: ${name}` } });
      }
      const args = msg.arguments && typeof msg.arguments === "object" && !Array.isArray(msg.arguments) ? msg.arguments : {};
      const timeoutMs = typeof msg.timeoutMs === "number" && msg.timeoutMs > 0 ? msg.timeoutMs : 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const run = surface
        .execute(tool.name, args, { signal: controller.signal, autoConfirmReadOnly: true })
        .catch((error: unknown): VoiceClientToolOutcome => ({
          status: "failed",
          error: { message: error instanceof Error ? error.message : String(error) },
        }));
      // The deadline also stops a gate still waiting: a late approval must not run the tool.
      const deadline = new Promise<VoiceClientToolOutcome>((resolve) => {
        if (timeoutMs)
          timer = setTimeout(() => {
            controller.abort();
            resolve({ status: "timeout", error: { message: `Page tool exceeded ${timeoutMs}ms.` } });
          }, timeoutMs);
      });
      void Promise.race([run, deadline]).then((outcome) => {
        clearTimeout(timer);
        reply(outcome);
      });
    },
  };
}
