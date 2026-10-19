import type { EveSessionEvent, EveSessionStream } from "./eve-adapter";
import { documentMarkdown, milestones, type WorkspaceDocument } from "./workspace";

/** A deterministic fixture of Eve events, sent through the production adapter. */
export function previewSession(document: WorkspaceDocument, delayMs = 35): EveSessionStream {
  return async function* ({ prompt, signal }) {
    const pause = async () => {
      signal?.throwIfAborted();
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      signal?.throwIfAborted();
    };
    const tool = async function* (name: string, input: unknown, output: unknown): AsyncGenerator<EveSessionEvent> {
      const callId = `preview_${name}`;
      yield { type: "actions.requested", data: { actions: [{ kind: "tool-call", callId, toolName: name, input }] } };
      await pause();
      yield { type: "action.result", data: { status: "completed", result: { callId, output } } };
    };
    const reasoning = "Preview plan: read the selected document, compare its commitments with the project milestones, then separate confirmed facts from open questions.";
    yield { type: "reasoning.appended", data: { reasoningDelta: reasoning, stepIndex: 0, turnId: "preview" } };
    await pause();
    yield { type: "reasoning.completed", data: { reasoning, stepIndex: 0, turnId: "preview" } };
    yield* tool("read_document", { document: document.title }, { content: documentMarkdown(document) });
    yield* tool("review_milestones", { project: "Atlas" }, { milestones });
    const question = prompt.split("\n\nUser: ").at(-1)?.replace(/^User: /, "").toLowerCase() ?? "";
    let answer: string;
    if (/risk|block|missing|question/.test(question)) {
      answer = `Three things need attention before the pilot opens:\n\n1. **Import reliability** — Noah’s check is due October 22. A failed check blocks release.\n2. **First-run experience** — Elena’s validation is due October 23, leaving a narrow window before October 26.\n3. **Help center ownership** — no owner or date is assigned. This is the clearest planning gap.\n\n**Suggested next step:** assign the help center owner, then confirm all three gates before Maya makes the go/no-go decision. October 26 is a target, not a commitment.\n\n_Source: ${document.title} and the project milestones._`;
    } else if (/plan|next|checklist|action|week/.test(question)) {
      answer = `Here’s a focused plan for the Atlas pilot:\n\n- **Now:** assign one owner and a due date for the help center.\n- **October 22:** Noah completes the import reliability check.\n- **October 23:** Elena shares first-run validation findings. Resolve blockers before inviting teams.\n- **October 26, if ready:** Maya approves the pilot. Start with six design partners, observe for 48 hours, then expand toward 40 teams.\n\nKeep integrations and automated imports outside this release. The goal is a useful first decision brief, not a larger feature list.\n\n_This is a proposed checklist; no tasks or documents have been changed._`;
    } else if (/summari|summary|brief|recap/.test(question)) {
      const summaries: Record<WorkspaceDocument["id"], string> = {
        "launch-brief": "**Atlas helps small product teams turn research into a clear, source-linked decision.**\n\nThe pilot focuses on shared projects, research notes, summaries, and decision briefs. It excludes integrations and automated imports.\n\nSuccess is **40 active pilot teams**, with **60% publishing a brief within seven days** and at least half returning the next week.",
        "research-notes": "**The gap is explaining decisions, not collecting more notes.**\n\nFive of six design partners already find it easy to gather research. Four maintain separate decision documents, and every participant wants to verify summaries against original sources.\n\nThe next step is an unmoderated first-run test, owned by Elena and due October 23. These six interviews are directional evidence, not a market-wide finding.",
        "release-plan": "**Release a focused pilot gradually, with three explicit quality gates.**\n\nStart with six design partners and expand toward 40 teams after a 48-hour review. Noah owns import reliability; Elena owns first-run validation. The help center still needs an owner.\n\nMaya makes the go/no-go decision. Pause invitations if teams lose content or cannot publish a brief.",
      };
      answer = `${summaries[document.id]}\n\n**Watch point:** October 26 is a target until import reliability, first-run validation, and help center readiness are confirmed.\n\n_Source: ${document.title} and the project milestones._`;
    } else {
      answer = `You’re in **Preview**, which uses prepared responses grounded in this sample workspace. I can demonstrate three workflows for **${document.title}**: summarize the document, identify launch risks, or draft next steps.\n\nChoose a follow-up below to explore one. Live Eve can answer open-ended questions when connected.`;
    }
    for (const part of answer.match(/.{1,38}(?:\s|$)|.{1,38}/gs) ?? []) {
      await pause();
      yield { type: "message.appended", data: { messageDelta: part } };
    }
    yield* tool("suggest_replies", { suggestions: [{ label: "Summarize this document" }, { label: "Find launch risks" }, { label: "Draft next steps" }] }, { content: [{ type: "text", text: "Suggestions shown to the user." }] });
  };
}
