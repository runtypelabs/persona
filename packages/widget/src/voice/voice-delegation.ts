import type {
  AgentWidgetApproval,
  AgentWidgetMessage,
  VoiceDelegationRequest,
  VoiceDelegationResult,
  VoiceSessionBridge,
} from "../types";

/** What a delegated turn streamed: its assistant messages, and whether it failed. */
export type VoiceDelegationCapture = { ids: string[]; failed: boolean };

/** The session internals the delegation bridge drives. */
export interface VoiceDelegationHost {
  messages(): AgentWidgetMessage[];
  /** A chat turn is streaming, resuming, or running local (WebMCP) tools. */
  busy(): boolean;
  /** A local (WebMCP) tool is waiting on the visitor's approval. */
  parked(): boolean;
  /** The transcript bubble the request came from (see KeyedVoiceTranscript.claimUserTurn). */
  claim(userText: string, userTurnId?: string, userTurnIds?: string[]): string | null;
  /** sendMessage as a voice turn, submitting `userMessageId`'s bubble when given. */
  send(userText: string, userMessageId: string | undefined): Promise<void>;
  /** Route the chat stream's assistant messages and failures into `capture` (or stop). */
  track(capture: VoiceDelegationCapture | null): void;
}

const SETTLE_POLL_MS = 50;
const WAITING_FOR_INPUT = "I need your answer in the chat before I can continue.";
const APPROVAL_SCRIPT_MAX_CHARS = 1000;
const APPROVAL_GUIDANCE =
  "Briefly tell the user what you're about to do and ask them to approve or decline it in the chat. Don't claim it's done.";

const sleep = () => new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
/** `place_pickup_order` / `webmcp:addToCart` → "place pickup order" / "add to cart". */
const humanize = (name: string) =>
  name
    .replace(/^webmcp:/, "")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();

/** A compact spoken summary of a tool argument ("2 almond croissants, 1 sourdough loaf"). */
function brief(value: unknown, depth = 0): string {
  if (value == null || value === "") return "";
  if (typeof value !== "object") return String(value);
  if (depth > 2) return "";
  if (Array.isArray(value)) return value.map((item) => brief(item, depth + 1)).filter(Boolean).join(", ");
  const record = value as Record<string, unknown>;
  const quantity = record.quantity ?? record.qty ?? record.count;
  const name = record.name ?? record.item ?? record.product ?? record.title;
  if (quantity != null && name != null && typeof name !== "object") return `${quantity} ${name}`;
  return Object.entries(record)
    // `_approvalReason` and other reserved keys are not arguments.
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, item]) => {
      const text = brief(item, depth + 1);
      return text && (depth ? `${humanize(key)} ${text}` : `${humanize(key)}: ${text}`);
    })
    .filter(Boolean)
    .join(depth ? ", " : "; ");
}

/**
 * The `delegation_result` text for a turn parked on approvals: what is about
 * to happen, so the voice model can ask for the decision in its own words.
 */
export function buildApprovalScript(approvals: AgentWidgetApproval[]): string {
  const header =
    approvals.length > 1
      ? "These actions need the user's approval in the chat before they happen:"
      : "This action needs the user's approval in the chat before it happens:";
  // Header, lines and guidance, with a newline after each line and one blank line.
  const budget = APPROVAL_SCRIPT_MAX_CHARS - header.length - APPROVAL_GUIDANCE.length - 2;
  const lines = approvals.map((approval) => {
    const parts = [humanize(approval.toolName)];
    if (approval.description) parts.push(`(${clip(approval.description.trim(), 160)})`);
    const args = brief(approval.parameters);
    if (args) parts.push(`with ${args}`);
    if (approval.reason) parts.push(`because: ${clip(approval.reason.trim(), 160)}`);
    return clip(`- ${parts.join(" ")}`, Math.floor(budget / approvals.length) - 1);
  });
  return `${header}\n${lines.join("\n")}\n\n${APPROVAL_GUIDANCE}`;
}

const isPendingApproval = (m: AgentWidgetMessage) => m.variant === "approval" && m.approval?.status === "pending";

/**
 * Builds the {@link VoiceSessionBridge} a full-duplex provider uses to run
 * delegated turns through the widget's chat pipeline. Ships in the lazy
 * voice-runtime chunk.
 */
export function createVoiceSessionBridge(host: VoiceDelegationHost): VoiceSessionBridge {
  // One tracking slot: a running delegated turn, else a parked turn's follow-up.
  let active: VoiceDelegationCapture | null = null;
  let following: VoiceDelegationCapture | null = null;
  const retrack = () => host.track(active ?? following);
  const answerOf = (ids: string[]) =>
    ids
      .flatMap((id) => host.messages().find((m) => m.id === id) ?? [])
      .filter((m) => !m.variant && m.content.trim())
      .map((m) => m.content.trim())
      .join("\n\n");

  // Turns end on many paths (stream end, WebMCP resumes, reconnects): poll.
  // A turn parked on the visitor stays busy, and a replaced one is done.
  const settled = async (capture?: VoiceDelegationCapture) => {
    do {
      await sleep();
    } while (host.busy() && !(capture && (host.parked() || capture.failed)));
  };

  return {
    getHistory: () =>
      host.messages().flatMap((m) =>
        (m.role === "user" || m.role === "assistant") &&
        !m.variant &&
        !m.voiceProcessing &&
        !m.voiceCaption &&
        m.content
          ? [{ role: m.role, content: m.content }]
          : [],
      ),

    async runDelegatedTurn({
      userText,
      userTurnId,
      userTurnIds,
    }: VoiceDelegationRequest): Promise<VoiceDelegationResult> {
      // Queue behind a turn already in flight rather than aborting it.
      if (host.busy()) await settled();
      const before = new Set(host.messages().map((m) => m.id));
      const raised = () => host.messages().filter((m) => !before.has(m.id) && m.variant === "approval");
      const capture: VoiceDelegationCapture = { ids: [], failed: false };
      active = capture;
      retrack();
      try {
        await host.send(userText, host.claim(userText, userTurnId, userTurnIds) ?? undefined);
        // Local tools and approvals may continue the turn past the first stream.
        await settled(capture);
      } catch {
        capture.failed = true;
      } finally {
        active = null;
        retrack();
      }
      const replies = capture.ids.flatMap((id) => host.messages().find((m) => m.id === id) ?? []);
      let text = answerOf(capture.ids);
      const pending = capture.failed ? [] : raised().filter(isPendingApproval);
      if (pending.length) {
        const own = new Set(pending.map((m) => m.id));
        // Parked on approvals: answer now, so the voice model asks for the
        // decision, then read the outcome back once the visitor decides.
        text = `${text}\n\n${buildApprovalScript(pending.map((m) => m.approval!))}`.trim();
        return {
          ok: true,
          text,
          followUp: async (signal) => {
            const follow: VoiceDelegationCapture = { ids: [], failed: false };
            // This turn's approvals, and any its resumed stream chains into
            // (not another turn's).
            const mine = () => raised().filter((m) => own.has(m.id) || follow.ids.includes(m.id));
            following = follow;
            retrack();
            try {
              // Every approval of this turn decided, and the resumed turn finished.
              while (!signal.aborted && (host.busy() || host.parked() || mine().some(isPendingApproval))) {
                await sleep();
              }
            } finally {
              if (following === follow) {
                following = null;
                retrack();
              }
            }
            if (signal.aborted || follow.failed) return "";
            const declined = mine()
              .filter((m) => m.approval?.status === "denied")
              .map((m) => humanize(m.approval!.toolName));
            return answerOf(follow.ids) || (declined.length ? `The user declined: ${declined.join(", ")}.` : "");
          },
        };
      }
      // A turn parked on the visitor's answer still answers now, so the voice
      // model can tell them to finish it in the chat.
      if (
        (!capture.failed && host.parked()) ||
        replies.some(
          (m) =>
            m.agentMetadata?.awaitingLocalTool &&
            !m.agentMetadata.askUserQuestionAnswered &&
            !m.toolCall?.name?.startsWith("webmcp:"),
        )
      ) {
        text = `${text}\n\n${WAITING_FOR_INPUT}`.trim();
      }
      return { ok: !capture.failed && !!text, text };
    },
  };
}
