/**
 * List-region state model plus its DOM. These blocks replace the LIST only:
 * the top bar, the primary new-conversation action, and the destructive footer
 * are built once and never move between states.
 */

import { createNode } from "../../utils/dom";
import { fillTemplate, type ResolvedHistoryViewCopy } from "./copy";
import {
  isHistoryProviderError,
  type HistoryProviderErrorCode,
} from "../../internal/history-provider";
import type { HistoryIdentityStatus } from "../../types";

export type HistoryListErrorReason =
  | "unavailable"
  | "authentication_failed"
  | "authentication_required"
  | "identity_provider_failed"
  | "proof_not_admitted"
  | "unsupported_scope"
  | "unknown";

export type HistoryListState =
  | { kind: "loading"; phase: "initial" | "refresh" | "load-more" }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "error"; reason: HistoryListErrorReason; retryable: boolean }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "new_conversation_required" };

function reasonForCode(
  code: HistoryProviderErrorCode
): HistoryListErrorReason {
  switch (code) {
    case "authentication_failed":
    case "authentication_required":
    case "identity_provider_failed":
    case "proof_not_admitted":
    case "unsupported_scope":
    case "unavailable":
      return code;
    default:
      return "unknown";
  }
}

/** Provider failures only ever reach the view as this domain vocabulary. */
export function toListState(error: unknown): HistoryListState {
  if (isHistoryProviderError(error)) {
    if (error.code === "rate_limited") {
      return {
        kind: "rate_limited",
        retryAfterSeconds: error.retryAfterSeconds ?? 0,
      };
    }
    const reason = reasonForCode(error.code);
    return {
      kind: "error",
      reason,
      // A scope the provider cannot serve will not start working on retry.
      retryable: reason !== "unsupported_scope",
    };
  }
  return { kind: "error", reason: "unknown", retryable: true };
}

export interface StateBlockOptions {
  state: Exclude<HistoryListState, { kind: "ready" }>;
  copy: ResolvedHistoryViewCopy;
  identityStatus: HistoryIdentityStatus;
  busy: boolean;
  /** Present only where retrying is meaningful. */
  onRetry?: () => void;
  /** Present only for the replacement-conversation recovery state. */
  onStartNew?: () => void;
}

/** Identity failures explain themselves rather than showing an empty list. */
function identityCopy(
  status: HistoryIdentityStatus,
  copy: ResolvedHistoryViewCopy
): { title: string; description: string } | null {
  switch (status.state) {
    case "authentication_required":
      return {
        title: copy.authenticationRequiredTitle,
        description: copy.authenticationRequiredDescription,
      };
    case "identity_provider_failed":
      return {
        title: copy.identityProviderFailedTitle,
        description: copy.identityProviderFailedDescription,
      };
    case "configuration_error":
      return {
        title: copy.proofNotAdmittedTitle,
        description: copy.proofNotAdmittedDescription,
      };
    default:
      return null;
  }
}

function errorCopy(
  reason: HistoryListErrorReason,
  copy: ResolvedHistoryViewCopy
): { title: string; description: string } {
  switch (reason) {
    case "authentication_required":
    case "authentication_failed":
      return {
        title: copy.authenticationRequiredTitle,
        description: copy.authenticationRequiredDescription,
      };
    case "identity_provider_failed":
      return {
        title: copy.identityProviderFailedTitle,
        description: copy.identityProviderFailedDescription,
      };
    case "proof_not_admitted":
    case "unsupported_scope":
      return {
        title: copy.proofNotAdmittedTitle,
        description: copy.proofNotAdmittedDescription,
      };
    case "unavailable":
      return {
        title: copy.unavailableTitle,
        description: copy.unavailableDescription,
      };
    default:
      return { title: copy.errorTitle, description: copy.errorDescription };
  }
}

function buildAction(
  label: string,
  focusKey: string,
  busy: boolean,
  onClick: () => void
): HTMLButtonElement {
  const button = createNode("button", {
    className: "persona-history-secondary persona-history-state-action",
    text: label,
    attrs: {
      type: "button",
      "data-persona-history-focus": focusKey,
      ...(busy ? { "aria-disabled": "true" } : {}),
    },
  });
  button.addEventListener("click", () => {
    if (busy) return;
    onClick();
  });
  return button;
}

function buildBlock(
  kind: string,
  title: string,
  description: string,
  action: HTMLElement | null,
  alert: boolean
): HTMLElement {
  return createNode(
    "div",
    {
      className: "persona-history-state",
      attrs: {
        "data-persona-history-state": kind,
        ...(alert ? { role: "alert" } : { role: "status" }),
      },
    },
    createNode("p", { className: "persona-history-state-title", text: title }),
    createNode("p", {
      className: "persona-history-state-description",
      text: description,
    }),
    action
  );
}

/** Three row-shaped skeletons, no fake readable text. Motion is CSS-gated. */
function buildLoadingBlock(copy: ResolvedHistoryViewCopy): HTMLElement {
  const rows = [0, 1, 2].map((index) =>
    createNode(
      "div",
      {
        className: "persona-history-skeleton-row",
        attrs: { "aria-hidden": "true" },
      },
      createNode("div", {
        className: "persona-history-skeleton-bar persona-history-skeleton-bar--short",
      }),
      createNode("div", {
        className: `persona-history-skeleton-bar persona-history-skeleton-bar--${
          index === 1 ? "medium" : "wide"
        }`,
      })
    )
  );
  return createNode(
    "div",
    {
      className: "persona-history-view-loading",
      attrs: {
        "data-persona-history-state": "loading",
        role: "status",
        "aria-label": copy.loadingLabel,
      },
    },
    ...rows
  );
}

export function buildStateBlock(options: StateBlockOptions): HTMLElement {
  const { state, copy, busy } = options;

  if (state.kind === "loading") return buildLoadingBlock(copy);

  if (state.kind === "empty") {
    const identity = identityCopy(options.identityStatus, copy);
    if (identity) {
      return buildBlock(
        "identity",
        identity.title,
        identity.description,
        options.onRetry
          ? buildAction(
              copy.retryIdentityLabel,
              "state-retry",
              busy,
              options.onRetry
            )
          : null,
        true
      );
    }
    return buildBlock("empty", copy.emptyTitle, copy.emptyDescription, null, false);
  }

  if (state.kind === "rate_limited") {
    const description =
      state.retryAfterSeconds > 0
        ? fillTemplate(copy.rateLimitedWaitDescription, {
            seconds: state.retryAfterSeconds,
          })
        : copy.rateLimitedDescription;
    return buildBlock(
      "rate_limited",
      copy.rateLimitedTitle,
      description,
      options.onRetry
        ? buildAction(copy.retryLabel, "state-retry", busy, options.onRetry)
        : null,
      false
    );
  }

  if (state.kind === "new_conversation_required") {
    return buildBlock(
      "new_conversation_required",
      copy.newConversationRequiredTitle,
      copy.newConversationRequiredDescription,
      options.onStartNew
        ? buildAction(
            copy.newConversationLabel,
            "state-retry",
            busy,
            options.onStartNew
          )
        : null,
      true
    );
  }

  const { title, description } = errorCopy(state.reason, copy);
  const retryLabel =
    state.reason === "authentication_required" ||
    state.reason === "authentication_failed" ||
    state.reason === "identity_provider_failed"
      ? copy.retryIdentityLabel
      : copy.retryLabel;
  return buildBlock(
    "error",
    title,
    description,
    state.retryable && options.onRetry
      ? buildAction(retryLabel, "state-retry", busy, options.onRetry)
      : null,
    true
  );
}
