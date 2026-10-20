"use agent";
import { useModel, useTool } from "@flue/runtime";
import * as v from "valibot";
import { getRelease } from "../../../app/lib/releases";

export function ReleaseAssistant() {
  useModel(process.env.FLUE_MODEL || "openai/gpt-5.5");
  useTool({
    name: "inspect_release",
    description: "Read readiness checks and owners for a sample release.",
    input: v.object({ release: v.picklist(["october", "september"]) }),
    async run({ data }) {
      const release = getRelease(data.release);
      return {
        output: {
          version: release.version,
          date: release.date,
          checks: release.checks,
        },
      };
    },
  });
  useTool({
    name: "read_changes",
    description:
      "Read the changes included in a sample release before drafting notes.",
    input: v.object({ release: v.picklist(["october", "september"]) }),
    async run({ data }) {
      return { output: getRelease(data.release).changes };
    },
  });
  return "You are Orbit's release assistant. Check inspect_release and read_changes before answering. Be concise, concrete, and helpful. The data is a sample workspace, not a real deployment. Explain pending owners and next steps. Draft customer-facing release notes on request. You cannot approve checks, publish releases, or modify source data. Never claim you did. The user's message specifies the current release.";
}
ReleaseAssistant.agentName = "orbit-release-assistant";
