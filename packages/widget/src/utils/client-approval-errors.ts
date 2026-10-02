/**
 * Visitor-facing failures for client-token approval decisions
 * (`POST /v1/client/approve`). Every failure carries plain-language copy the
 * session renders into the transcript, so a rejected decision never leaves an
 * empty bubble or a silently stuck conversation.
 */

/** Branch on `reason`, never on message text. */
export type ClientApprovalErrorReason =
  | "alreadyResolved"
  | "expired"
  | "requiresOwner"
  | "unsupported"
  | "sessionExpired"
  | "forbidden"
  | "unavailable"
  | "failed";

const VISITOR_MESSAGES: Record<ClientApprovalErrorReason, string> = {
  alreadyResolved: "This request was already answered.",
  expired: "This request expired before your answer arrived.",
  requiresOwner:
    "This action needs the business's approval, so it can't be approved from the chat.",
  unsupported: "This chat can't accept approvals yet.",
  sessionExpired: "Your chat session expired. Refresh the page and try again.",
  forbidden: "This request can't be answered from this chat.",
  unavailable: "The assistant is unavailable right now. Please try again later.",
  failed: "Your answer couldn't be sent. Please try again.",
};

export class ClientApprovalError extends Error {
  readonly reason: ClientApprovalErrorReason;
  readonly status?: number;
  readonly code?: string;
  /** Plain-language copy for the transcript. */
  readonly visitorMessage: string;

  constructor(
    reason: ClientApprovalErrorReason,
    details: { status?: number; code?: string; serverMessage?: string } = {}
  ) {
    const visitorMessage = VISITOR_MESSAGES[reason];
    super(details.serverMessage || visitorMessage);
    this.name = "ClientApprovalError";
    this.reason = reason;
    this.status = details.status;
    this.code = details.code;
    this.visitorMessage = visitorMessage;
  }
}

export const REQUIRES_OWNER_APPROVAL_CODE = "APPROVAL_APPROVER_NOT_END_USER";

const readJsonBody = async (
  response: Response
): Promise<{ error?: unknown; code?: unknown; message?: unknown } | null> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * Map a non-OK `/v1/client/approve` response to a {@link ClientApprovalError}.
 *
 * A 404 with a JSON `error` body means nothing is paused (or the approval
 * expired). A 404 without one means the route itself doesn't exist on this
 * server, which is reported as unsupported rather than retried elsewhere.
 */
export const clientApprovalErrorFromResponse = async (
  response: Response
): Promise<ClientApprovalError> => {
  const body = await readJsonBody(response);
  const serverMessage = asString(body?.error) ?? asString(body?.message);
  const code =
    asString(body?.code) ??
    (body?.error === REQUIRES_OWNER_APPROVAL_CODE ? REQUIRES_OWNER_APPROVAL_CODE : undefined);
  const details = { status: response.status, code, serverMessage };

  switch (response.status) {
    case 409:
      return new ClientApprovalError("alreadyResolved", details);
    case 404:
      return new ClientApprovalError(serverMessage ? "expired" : "unsupported", details);
    case 403:
      return new ClientApprovalError(
        code === REQUIRES_OWNER_APPROVAL_CODE ? "requiresOwner" : "forbidden",
        details
      );
    case 401:
      return new ClientApprovalError("sessionExpired", details);
    default:
      return new ClientApprovalError(
        response.status >= 500 ? "unavailable" : "failed",
        details
      );
  }
};
