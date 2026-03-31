import { describe, expect, it } from "vitest";

import {
  applyImplementationRequestPatch,
  createInitialImplementationRequestForm,
  getSubmissionReadiness
} from "@/lib/implementation-form";

describe("applyImplementationRequestPatch", () => {
  it("applies allowlisted AI fields and normalizes values", () => {
    const result = applyImplementationRequestPatch(
      createInitialImplementationRequestForm(),
      {
        projectName: "  Support Portal Launch  ",
        contactEmail: "launch-owner@example.com",
        channels: ["Slack", "Email", "Slack"]
      }
    );

    expect(result.rejected).toEqual([]);
    expect(result.nextState.projectName).toBe("Support Portal Launch");
    expect(result.nextState.contactEmail).toBe("launch-owner@example.com");
    expect(result.nextState.channels).toEqual(["Slack", "Email"]);
  });

  it("rejects manual-only, invalid, and unknown fields", () => {
    const result = applyImplementationRequestPatch(
      createInitialImplementationRequestForm(),
      {
        securityApproved: false,
        region: "apac",
        madeUpField: "value"
      }
    );

    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([
      {
        fieldId: "securityApproved",
        reason: "field is intentionally human-review only",
        value: false
      },
      {
        fieldId: "region",
        reason: "must be one of the allowlisted options",
        value: "apac"
      },
      {
        fieldId: "madeUpField",
        reason: "field is not part of the implementation request registry",
        value: "value"
      }
    ]);
  });
});

describe("getSubmissionReadiness", () => {
  it("treats the seeded manual defaults as ready", () => {
    expect(
      getSubmissionReadiness(createInitialImplementationRequestForm())
    ).toEqual({
      ready: true,
      missingManualFieldIds: [],
      missingManualFieldLabels: []
    });
  });

  it("flags missing manual fields", () => {
    const result = getSubmissionReadiness({
      ...createInitialImplementationRequestForm(),
      securityApproved: false,
      finalApprover: " "
    });

    expect(result.ready).toBe(false);
    expect(result.missingManualFieldIds).toEqual([
      "securityApproved",
      "finalApprover"
    ]);
    expect(result.missingManualFieldLabels).toEqual([
      "Security approved",
      "Final approver"
    ]);
  });
});
