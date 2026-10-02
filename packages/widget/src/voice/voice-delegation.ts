import type {
  AgentWidgetApproval,
  AgentWidgetMessage,
  VoiceDelegationFollowUp,
  VoiceDelegationRequest,
  VoiceDelegationResult,
  VoiceSessionBridge,
} from "../types";

/**
 * What a delegated turn streamed: its assistant messages, whether it failed,
 * and whether the server dropped its result (then browser TTS may read it).
 */
export type VoiceDelegationCapture = { ids: string[]; failed: boolean; dropped?: boolean };

/** The session internals the delegation bridge drives. */
export interface VoiceDelegationHost {
  messages(): AgentWidgetMessage[];
  /** A chat turn is streaming, resuming, or running local (WebMCP) tools. */
  busy(): boolean;
  /** A local (WebMCP) tool is waiting on the visitor's approval. */
  parked(): boolean;
  /** The transcript bubble the request came from (see KeyedVoiceTranscript.claimUserTurn). */
  claim(userText: string, userUtteranceIds: string[]): string | null;
  /** sendMessage as a voice turn, submitting `userMessageId`'s bubble when given. */
  send(userText: string, userMessageId: string | undefined): Promise<void>;
  /** Route the chat stream's assistant messages and failures into `capture` (or stop). */
  track(capture: VoiceDelegationCapture | null): void;
  /** Deny a pending approval (server gate or WebMCP) by its message id. */
  decide(approvalMessageId: string): void;
  /** Let browser TTS read these messages after all (their spoken result was dropped). */
  unspoken(messageIds: string[]): void;
}

const SETTLE_POLL_MS = 50;
const WAITING_FOR_INPUT = "I need your answer in the chat before I can continue.";
const APPROVAL_SCRIPT_MAX_CHARS = 1000;
/** How long a voice-originated approval waits for the visitor (Amendment 4). */
const APPROVAL_TTL_MS = 5 * 60_000;
// Unambiguous spoken declines only (on normalized text); anything else runs as
// a normal turn. Nothing is ever approved by voice.
const DECLINE_PHRASE =
  "no|nope|never ?mind|decline(?: it| that)?|cancel(?: it| that| this)?(?: (?:the|my|that|this) (?:[a-z]+ )?(?:order|request))?|don'?t (?:do|place) (?:it|that|the (?:[a-z]+ )?order)";
const VOICE_DECLINE = new RegExp(`^(?:${DECLINE_PHRASE})(?: (?:${DECLINE_PHRASE}))?(?: thanks| thank you)?$`);
/** Whether `userText` is an unambiguous spoken decline ("cancel that", "never mind"). */
export const isVoiceDecline = (userText: string) =>
  VOICE_DECLINE.test(
    userText
      .toLowerCase()
      .replace(/[^a-z' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

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
  // Voice-originated approval parks still awaiting a decision or follow-up.
  // `replaced`: approvals this bridge declined because a newer request for the same tool came in.
  type Parked = { approvals: string[]; at: number; replaced: Set<string>; outcome?: VoiceDelegationFollowUp };
  const parks: Parked[] = [];
  // Per delegation: the captures of its turn and follow-up, so a result the
  // server dropped can be handed back to browser TTS. Bounded: recent calls only.
  const captures = new Map<string, VoiceDelegationCapture[]>();
  const remember = (delegationId: string, capture: VoiceDelegationCapture) => {
    captures.set(delegationId, [...(captures.get(delegationId) ?? []), capture]);
    if (captures.size > 32) captures.delete(captures.keys().next().value!);
  };
  const message = (id: string) => host.messages().find((m) => m.id === id);
  const pendingOf = (park: Parked) => park.approvals.filter((id) => message(id)?.approval?.status === "pending");
  const toolOf = (id: string) => humanize(message(id)?.approval?.toolName ?? "");
  /** Decide a park's outcome now, denying whatever of it is still pending. */
  const settle = (park: Parked, status: VoiceDelegationFollowUp["status"], text: string) => {
    park.outcome = { status, text };
    for (const id of pendingOf(park)) host.decide(id);
  };
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

    dropDelegation(delegationId) {
      for (const capture of captures.get(delegationId) ?? []) {
        capture.dropped = true;
        if (capture.ids.length) host.unspoken(capture.ids);
      }
    },

    async runDelegatedTurn({
      delegationId,
      userText,
      userUtteranceIds,
    }: VoiceDelegationRequest): Promise<VoiceDelegationResult> {
      const live = parks.filter((park) => pendingOf(park).length);
      const pendingIds = live.flatMap(pendingOf);
      // "Cancel that" while exactly one voice approval waits: deny it here; its
      // own follow-up stays silent, since this answer says so.
      if (pendingIds.length === 1 && isVoiceDecline(userText)) {
        const tool = toolOf(pendingIds[0]);
        // The parked delegation still gets its one terminal result, silently.
        settle(live[0], "denied", "");
        return { status: "denied", text: `Okay, I cancelled the ${tool} request. Nothing was done.` };
      }
      // A voice-originated WebMCP approval holds the chat turn open: this turn
      // replaces it (a new send declines it), so don't wait on it. Anything
      // else in flight finishes first.
      const replacing =
        host.parked() && host.messages().every((m) => !isPendingApproval(m) || pendingIds.includes(m.id));
      if (host.busy() && !replacing) await settled();
      const before = new Set(host.messages().map((m) => m.id));
      const raised = () => host.messages().filter((m) => !before.has(m.id) && m.variant === "approval");
      const capture: VoiceDelegationCapture = { ids: [], failed: false };
      remember(delegationId, capture);
      active = capture;
      retrack();
      try {
        await host.send(userText, host.claim(userText, userUtteranceIds) ?? undefined);
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

      // An earlier voice approval for the same tool is replaced by this one; a
      // WebMCP one this turn displaced (and so declined) is reported as such.
      const tools = new Set(pending.map((m) => humanize(m.approval!.toolName)));
      for (const park of live) {
        if (park.outcome) continue;
        // Only the approvals for the same tool are replaced; the park's others stand.
        for (const id of pendingOf(park).filter((id) => tools.has(toolOf(id)))) {
          park.replaced.add(id);
          host.decide(id);
        }
        const tool = toolOf(park.approvals[0]);
        if (park.approvals.every((id) => park.replaced.has(id))) {
          park.outcome = { status: "cancelled", text: `The earlier ${tool} request was replaced by the new one; it was not done.` };
        } else if (replacing && park.approvals.every((id) => message(id)?.approval?.status === "denied")) {
          park.outcome = { status: "cancelled", text: `The earlier ${tool} request was replaced by the new one; it was not done.` };
        }
      }

      if (pending.length) {
        const own = new Set(pending.map((m) => m.id));
        const park: Parked = { approvals: [...own], at: Date.now(), replaced: new Set() };
        parks.push(park);
        // Parked on approvals: answer now, so the voice model asks for the
        // decision, then read the outcome back once the visitor decides.
        text = `${text}\n\n${buildApprovalScript(pending.map((m) => m.approval!))}`.trim();
        return {
          status: "pending_approval",
          text,
          followUp: async ({ signal, approvalTimeoutMs = APPROVAL_TTL_MS, readBack = true, onUpdate }) => {
            const follow: VoiceDelegationCapture = { ids: [], failed: false };
            // Called once the ask went out: it carried this turn's reply to the
            // voice model, so a later drop releases only the follow-up's answer.
            captures.delete(delegationId);
            remember(delegationId, follow);
            // This turn's approvals, and any its resumed stream chains into
            // (not another turn's).
            const mine = () => raised().filter((m) => own.has(m.id) || follow.ids.includes(m.id));
            // A gated tool the resumed turn chains into: a new approval of this
            // park (server gate: captured; WebMCP: the one pending while this
            // follow-up owns the stream), asked for with another update.
            const chained = () =>
              raised().filter(
                (m) =>
                  isPendingApproval(m) &&
                  !own.has(m.id) &&
                  !parks.some((other) => other.approvals.includes(m.id)) &&
                  (follow.ids.includes(m.id) || (m.approval?.toolType === "webmcp" && following === follow)),
              );
            const claim = () => {
              following = follow;
              retrack();
            };
            if (readBack) claim();
            try {
              // Every approval of this turn decided (or replaced, cancelled,
              // expired), and the resumed turn finished.
              while (!signal.aborted && !park.outcome && (active || host.busy() || mine().some(isPendingApproval))) {
                // With several turns parked, the one whose approvals were just
                // decided takes the capture slot back: its resumed stream is next.
                if (readBack && following !== follow && !pendingOf(park).length) claim();
                const next = chained();
                if (next.length) {
                  for (const m of next) {
                    own.add(m.id);
                    park.approvals.push(m.id);
                  }
                  park.at = Date.now();
                  onUpdate?.(buildApprovalScript(next.map((m) => m.approval!)));
                }
                // Unanswered too long: decline it, but never by aborting a
                // turn in flight (a parked WebMCP turn is the one waiting).
                if (Date.now() - park.at >= approvalTimeoutMs && pendingOf(park).length && (!host.busy() || host.parked())) {
                  settle(park, "timeout", `That ${toolOf(park.approvals[0])} request expired, so nothing was done.`);
                  break;
                }
                await sleep();
              }
            } finally {
              if (following === follow) {
                following = null;
                retrack();
              }
              // Hang-up stops voice follow-ups; the approval card stays usable.
              parks.splice(parks.indexOf(park), 1);
            }
            if (signal.aborted) return null;
            if (park.outcome) return park.outcome;
            if (follow.failed) return { status: "failed", text: `The ${toolOf(park.approvals[0])} request didn't complete.` };
            const decided = mine();
            const names = (pick: (m: AgentWidgetMessage) => boolean) =>
              decided.filter(pick).map((m) => humanize(m.approval!.toolName)).join(", ");
            const approved = decided.some((m) => m.approval?.status === "approved");
            const declined = names((m) => m.approval?.status === "denied" && !park.replaced.has(m.id));
            const replaced = names((m) => park.replaced.has(m.id));
            const timedOut = names((m) => m.approval?.status === "timeout");
            // An approved action's result is read back; a decline is stated
            // plainly, since the agent's own reply to it often re-asks for
            // confirmation, which the voice model would repeat.
            const text = [
              approved ? answerOf(follow.ids) : "",
              declined && `The user declined the ${declined} request in the chat, so ${approved ? "that part was not done" : "nothing was done"}.`,
              replaced && `The earlier ${replaced} request was replaced by the new one; it was not done.`,
              timedOut && `The ${timedOut} request timed out, so it was not done.`,
            ]
              .filter(Boolean)
              .join("\n\n");
            return {
              status: approved ? "completed" : declined ? "denied" : replaced ? "cancelled" : timedOut ? "timeout" : "completed",
              text,
            };
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
        return { status: capture.failed ? "failed" : "completed", text: `${text}\n\n${WAITING_FOR_INPUT}`.trim() };
      }
      return { status: !capture.failed && text ? "completed" : "failed", text };
    },
  };
}
