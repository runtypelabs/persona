import type { FlueConversationMessage } from "@flue/sdk";
import { createConversationProjector } from "./flue-adapter";
import { createPersonaSSEStream } from "./persona-wire";
import { getRelease } from "./releases";

/** Deterministic fixtures go through the same materialized-part mapping as Live. */
export function previewResponse(
  prompt: string,
  releaseId: unknown,
  requestSignal?: AbortSignal
) {
  // Keep snapshots stable within this request without colliding with earlier turns.
  const requestId = `preview-${crypto.randomUUID()}`;
  const release = getRelease(releaseId);
  const blockers = release.checks.filter(
    (check) => check.status === "attention"
  );
  const notes = /note|draft|announce|customer/i.test(prompt);
  const selectedChange = release.changes.find(
    (change) => prompt.includes(change.id) || prompt.includes(change.title)
  );
  const summary = /summari[sz]e|summary|what.*chang/i.test(prompt);
  const answer = selectedChange
    ? `## ${selectedChange.title}\n\n**${
        selectedChange.id
      }** is a **${selectedChange.area.toLowerCase()}** change in Orbit ${
        release.version
      }, contributed by **${selectedChange.author}**.\n\n${
        release.description
      }\n\nThe sample workspace contains the title, area, and contributor; it does not include a detailed implementation description.\n\n*Preview response · Based on the sample release workspace.*`
    : summary
    ? `## What’s in Orbit ${release.version}\n\n${release.changes
        .map(
          (change) =>
            `- **${change.title}** — ${change.area}, by ${change.author}.`
        )
        .join("\n")}\n\n${
        blockers.length
          ? "Two readiness checks are still in review: accessibility and release notes."
          : "All readiness checks have passed."
      }\n\n*Preview response · Based on the sample release workspace.*`
    : notes
    ? `## Introducing Orbit ${release.version}\n\n${
        release.description
      }\n\n${release.changes
        .map(
          (change) =>
            `- **${change.title}** — ${change.area.toLowerCase()} improvements.`
        )
        .join("\n")}\n\n${
        blockers.length
          ? "This is a draft. Finish the accessibility and editorial reviews before publishing."
          : "The release has passed all four readiness checks."
      }\n\n*Preview draft · Based on the sample release workspace.*`
    : `## ${
        blockers.length
          ? "Two small steps before launch"
          : "Ready for the next chapter"
      }\n\nI reviewed **Orbit ${
        release.version
      }** against the release checklist and ${
        release.changes.length
      } included changes.\n\n${
        blockers.length
          ? "The build and performance checks are green. Before the release goes out:\n\n1. **Design:** complete the command-menu keyboard review.\n2. **Product:** approve the release-notes draft.\n\nKeep the release in review until both owners sign off."
          : "All four checks passed, including accessibility and release notes. This release is ready to share."
      }\n\n*Preview response · Based on the sample release workspace.*`;
  return createPersonaSSEStream(
    async ({ emit, signal }) => {
      signal.throwIfAborted();
      const projector = createConversationProjector(emit, requestId);
      const message: FlueConversationMessage = {
        id: `${requestId}-reply`,
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: requestId,
        timestamp: new Date().toISOString(),
        parts: [
          {
            type: "reasoning",
            state: "done",
            text: "Preview activity summary: inspect the sample readiness checks, then read the included changes before preparing a release review.",
          },
          {
            type: "dynamic-tool",
            toolName: "inspect_release",
            toolCallId: `${requestId}-release`,
            state: "output-available",
            input: { release: release.id },
            output: { version: release.version, checks: release.checks },
          },
          {
            type: "dynamic-tool",
            toolName: "read_changes",
            toolCallId: `${requestId}-changes`,
            state: "output-available",
            input: { release: release.id },
            output: release.changes,
          },
        ],
      };
      projector.project([message]);
      const text = {
        type: "text" as const,
        text: "",
        state: "streaming" as const,
      };
      message.parts.push(text);
      for (const chunk of answer.match(/.{1,28}(?:\s|$)|.{1,28}/gs) ?? []) {
        signal.throwIfAborted();
        text.text += chunk;
        projector.project([message]);
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      signal.throwIfAborted();
      emit.suggestReplies(
        notes
          ? ["Check launch readiness", "Who owns the remaining reviews?"]
          : ["Draft the release notes", "Summarize the changes"]
      );
    },
    { signal: requestSignal }
  );
}
