import { z } from "zod";

import {
  aiWritableFieldIds,
  manualReviewFieldIds,
  type FormFieldId
} from "@/lib/implementation-form";
import {
  demoRoutes,
  getRouteIdFromPathname,
  routeIds,
  type DemoRouteId
} from "@/lib/demo-routes";

export type ClientAction =
  | {
      action: "message";
      text: string;
    }
  | {
      action: "navigate_to_route";
      routeId: DemoRouteId;
      text: string;
    }
  | {
      action: "prefill_form";
      patch: Record<string, unknown>;
      text: string;
    }
  | {
      action: "submit_form";
      text: string;
    };

export type CapabilityManifest = {
  currentRouteId: DemoRouteId | null;
  availableActions: ClientAction["action"][];
  routeIds: readonly DemoRouteId[];
  routeMap: Record<DemoRouteId, string>;
  prefill: {
    enabled: boolean;
    allowedFieldIds: FormFieldId[];
    blockedFieldIds: FormFieldId[];
  };
  submit: {
    enabled: boolean;
    approvalRequired: boolean;
  };
  safeguards: string[];
};

const clientActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("message"),
    text: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("navigate_to_route"),
    routeId: z.enum(routeIds),
    text: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("prefill_form"),
    patch: z.record(z.string(), z.unknown()),
    text: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("submit_form"),
    text: z.string().trim().min(1)
  })
]);

export function parseClientAction(raw: unknown): ClientAction | null {
  const result = clientActionSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }

  return result.data;
}

export function createCapabilityManifest(pathname: string): CapabilityManifest {
  const currentRouteId = getRouteIdFromPathname(pathname);
  const prefillEnabled = pathname === demoRoutes.demo_form.path;
  const submitEnabled = pathname === demoRoutes.demo_form.path;

  return {
    currentRouteId,
    availableActions: prefillEnabled
      ? ["message", "navigate_to_route", "prefill_form", "submit_form"]
      : ["message", "navigate_to_route"],
    routeIds,
    routeMap: Object.fromEntries(
      routeIds.map((routeId) => [routeId, demoRoutes[routeId].path])
    ) as Record<DemoRouteId, string>,
    prefill: {
      enabled: prefillEnabled,
      allowedFieldIds: prefillEnabled ? aiWritableFieldIds : [],
      blockedFieldIds: manualReviewFieldIds
    },
    submit: {
      enabled: submitEnabled,
      approvalRequired: true
    },
    safeguards: [
      "Only same-origin route IDs are allowed.",
      "Unknown field IDs are rejected locally.",
      "Manual review fields never accept AI patches.",
      "submit_form is only available on /demo-form and always requires approval."
    ]
  };
}
