import type { Ticket } from "../shared/tickets";

export const runbooks = [
  {
    id: "billing-authorizations",
    title: "Pending card authorizations",
    category: "Billing",
    customerReply:
      "Thanks for confirming that one entry is pending and one is completed. The pending entry may be a temporary authorization from the upgrade. These usually clear in 5–10 business days, depending on your card issuer. If both entries settle, please share the two transaction references so our billing team can investigate. We haven’t issued a refund or changed your billing.",
    steps: [
      "Confirm whether each bank entry is pending or settled.",
      "An upgrade can create a temporary authorization beside the settled invoice.",
      "Pending authorizations typically clear in 5–10 business days; timing depends on the card issuer.",
      "If both entries settle, collect the two transaction references and escalate to Billing. Never promise a refund before review.",
    ],
  },
  {
    id: "resend-invitations",
    title: "Resending an expired invitation",
    category: "Access",
    customerReply:
      "You can resend the invitation without removing your teammate. A workspace admin can go to Settings → Members → Pending invitations and select Resend. Invitations expire after seven days, and the newest email replaces the old link. Please ask your teammate to use the latest invitation and sign in with the invited email address.",
    steps: [
      "Workspace invitations expire after seven days.",
      "A workspace admin can open Settings → Members → Pending invitations and select Resend.",
      "Use the latest invitation email; resending invalidates the older link.",
      "Confirm the teammate signs in with the email address that received the invitation.",
    ],
  },
  {
    id: "webhook-delivery",
    title: "Delayed webhook delivery",
    category: "Integrations",
    customerReply:
      "Please keep your endpoint available, return a 2xx response, and deduplicate events by their event IDs. If delays continue after the incident resolves, send us a few event IDs and timestamps so we can investigate.",
    steps: [
      "Keep the webhook endpoint available and returning a 2xx response.",
      "Delivery retries use exponential backoff; do not manually duplicate the underlying order.",
      "Deduplicate received events by event ID.",
      "If delay persists after the incident resolves, collect event IDs and timestamps for investigation.",
    ],
  },
];

export type ServiceName = "billing" | "invitations" | "webhooks";
export const serviceStatuses: Record<
  ServiceName,
  {
    service: ServiceName;
    status: "operational" | "degraded";
    detail: string;
    asOf: string;
  }
> = {
  billing: {
    service: "billing",
    status: "operational",
    detail: "No active billing incident in the sample status snapshot.",
    asOf: "2026-10-19T10:40:00Z",
  },
  invitations: {
    service: "invitations",
    status: "operational",
    detail: "Invitation delivery is operating normally in the sample snapshot.",
    asOf: "2026-10-19T10:40:00Z",
  },
  webhooks: {
    service: "webhooks",
    status: "degraded",
    detail:
      "Sample incident: elevated webhook queue latency, approximately five minutes. Delivery continues; no resolution time is available.",
    asOf: "2026-10-19T10:40:00Z",
  },
};
export function ticketService(ticket: Ticket): ServiceName {
  return ticket.category === "Billing"
    ? "billing"
    : ticket.category === "Access"
    ? "invitations"
    : "webhooks";
}
export function searchRunbook(query: string) {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  return runbooks.filter((book) =>
    terms.some((term) =>
      `${book.title} ${book.category} ${book.steps.join(" ")}`
        .toLowerCase()
        .includes(term)
    )
  );
}
