import { describe, expect, it } from "vitest";

import {
  createCapabilityManifest,
  parseClientAction
} from "@/lib/chat/action-contract";
import { demoRoutes } from "@/lib/demo-routes";

describe("parseClientAction", () => {
  it("parses submit_form actions", () => {
    expect(
      parseClientAction({
        action: "submit_form",
        text: "Submitting the demo form now."
      })
    ).toEqual({
      action: "submit_form",
      text: "Submitting the demo form now."
    });
  });
});

describe("createCapabilityManifest", () => {
  it("limits the home route to navigation and plain messages", () => {
    expect(createCapabilityManifest(demoRoutes.home.path)).toMatchObject({
      currentRouteId: "home",
      availableActions: ["message", "navigate_to_route"],
      submit: {
        enabled: false,
        approvalRequired: true
      }
    });
  });

  it("enables prefill and approval-gated submit on the form route", () => {
    expect(createCapabilityManifest(demoRoutes.demo_form.path)).toMatchObject({
      currentRouteId: "demo_form",
      availableActions: [
        "message",
        "navigate_to_route",
        "prefill_form",
        "submit_form"
      ],
      prefill: {
        enabled: true,
        allowedFieldIds: [
          "projectName",
          "contactEmail",
          "launchDate",
          "region",
          "channels",
          "summary"
        ],
        blockedFieldIds: ["securityApproved", "finalApprover"]
      },
      submit: {
        enabled: true,
        approvalRequired: true
      }
    });
  });
});
