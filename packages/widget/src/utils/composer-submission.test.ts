import { describe, expect, it, vi } from "vitest";

import {
  applyBeforeSendResult,
  canSubmitComposer,
  runBeforeSend,
  toPublicSubmissionSnapshot,
  type InternalSubmissionSnapshot,
} from "./composer-submission";

const makeSnapshot = (
  overrides: Partial<InternalSubmissionSnapshot> = {}
): InternalSubmissionSnapshot => ({
  text: "hello",
  mentionRefs: [],
  options: {},
  ...overrides,
});

describe("canSubmitComposer", () => {
  it("accepts text, attachments, chips, or a server command bundle", () => {
    const base = {
      text: "",
      hasAttachments: false,
      attachmentsReady: true,
      hasMentions: false,
      hasServerMentions: false,
    };
    expect(canSubmitComposer({ ...base, text: "hi" })).toBe(true);
    expect(canSubmitComposer({ ...base, hasAttachments: true })).toBe(true);
    expect(canSubmitComposer({ ...base, hasMentions: true })).toBe(true);
    expect(canSubmitComposer({ ...base, hasServerMentions: true })).toBe(true);
    expect(canSubmitComposer(base)).toBe(false);
  });

  it("blocks the send while an attachment is not ready", () => {
    expect(
      canSubmitComposer({
        text: "ship it",
        hasAttachments: true,
        attachmentsReady: false,
        hasMentions: false,
        hasServerMentions: false,
      })
    ).toBe(false);
  });

  it("refuses an otherwise eligible send while either composer lock is set", () => {
    const eligible = {
      text: "ship it",
      hasAttachments: false,
      attachmentsReady: true,
      hasMentions: false,
      hasServerMentions: false,
    };
    expect(canSubmitComposer(eligible)).toBe(true);
    expect(canSubmitComposer({ ...eligible, inputDisabled: true })).toBe(false);
    expect(canSubmitComposer({ ...eligible, sendDisabled: true })).toBe(false);
    expect(
      canSubmitComposer({
        ...eligible,
        inputDisabled: false,
        sendDisabled: false,
      })
    ).toBe(true);
  });
});

describe("toPublicSubmissionSnapshot", () => {
  it("freezes the projection and drops non-public fields", () => {
    const internal = makeSnapshot({
      mentions: { refs: [], finalize: async () => ({}) },
      contentParts: [{ type: "text", text: "hello" }],
    });
    const view = toPublicSubmissionSnapshot(internal);

    expect(Object.isFrozen(view)).toBe(true);
    expect("mentions" in view).toBe(false);
    try {
      (view as { text: string }).text = "tampered";
    } catch {
      /* frozen */
    }
    expect(view.text).toBe("hello");
    expect(internal.text).toBe("hello");
  });

  it("copies arrays so the callback cannot reach the outgoing payload", () => {
    const internal = makeSnapshot({ contentParts: [] });
    const view = toPublicSubmissionSnapshot(internal);
    internal.contentParts!.push({ type: "text", text: "late" });
    expect(view.contentParts).toHaveLength(0);
  });
});

describe("applyBeforeSendResult", () => {
  it("cancels on false and proceeds on undefined", () => {
    expect(applyBeforeSendResult(makeSnapshot(), false).status).toBe("canceled");
    expect(applyBeforeSendResult(makeSnapshot(), undefined).status).toBe(
      "proceed"
    );
  });

  it("patches text and options only", () => {
    const snapshot = makeSnapshot();
    const outcome = applyBeforeSendResult(snapshot, {
      text: "patched",
      options: { selectedModelId: "m1" },
    });
    expect(outcome.status).toBe("proceed");
    expect(snapshot.text).toBe("patched");
    expect(snapshot.options.selectedModelId).toBe("m1");
  });
});

describe("runBeforeSend", () => {
  const signal = new AbortController().signal;

  it("stays synchronous for a synchronous hook", () => {
    const snapshot = makeSnapshot();
    const outcome = runBeforeSend(() => ({ text: "sync" }), snapshot, signal);
    expect(outcome).not.toBeInstanceOf(Promise);
    expect(snapshot.text).toBe("sync");
  });

  it("reports a synchronous throw as a preparation error", () => {
    const error = new Error("nope");
    const outcome = runBeforeSend(
      () => {
        throw error;
      },
      makeSnapshot(),
      signal
    );
    expect(outcome).toEqual({ status: "error", error });
  });

  it("awaits an async hook and applies its patch", async () => {
    const snapshot = makeSnapshot();
    const outcome = await runBeforeSend(
      async () => ({ text: "async" }),
      snapshot,
      signal
    );
    expect(outcome.status).toBe("proceed");
    expect(snapshot.text).toBe("async");
  });

  it("reports an aborted async hook as aborted, not an error", async () => {
    const controller = new AbortController();
    const hook = vi.fn(async () => {
      controller.abort();
      throw new Error("superseded");
    });
    const outcome = await runBeforeSend(hook, makeSnapshot(), controller.signal);
    expect(outcome.status).toBe("aborted");
  });

  it("drops a patch that resolves after abort", async () => {
    const controller = new AbortController();
    const snapshot = makeSnapshot();
    const outcome = await runBeforeSend(
      async () => {
        controller.abort();
        return { text: "too late" };
      },
      snapshot,
      controller.signal
    );
    expect(outcome.status).toBe("aborted");
    expect(snapshot.text).toBe("hello");
  });
});
