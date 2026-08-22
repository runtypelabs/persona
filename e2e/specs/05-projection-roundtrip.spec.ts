import { expect, test } from "@playwright/test";
import { divergentTurnStream, installFakeHistoryApi } from "../fixtures/fake-history-api";
import { fixtureUrl, sel, sendMessage, waitForWidget } from "../fixtures/history-page";

const DISPLAY = "Here are 3 shoes for you.";
const MODEL = JSON.stringify({
  action: "message",
  text: DISPLAY,
  products: ["sku-1", "sku-2", "sku-3"],
});

/**
 * Gate 2: a terminal structured assistant turn is finalized through the
 * display-projection PATCH, and reopening the conversation from server history
 * renders only that projection — never the model channel.
 */
test("a structured turn finalizes its projection and reopens without model content", async ({
  context,
}) => {
  const api = await installFakeHistoryApi(context);
  const page = await context.newPage();

  api.setChatStream(
    divergentTurnStream({ messageId: "asst_1", display: DISPLAY, raw: MODEL })
  );

  await page.goto(fixtureUrl({ mode: "intercepted" }));
  await waitForWidget(page);
  await sendMessage(page, "show me shoes");

  await expect(page.locator(sel.transcript)).toContainText(DISPLAY);
  // The model channel is never visible, not even mid-turn.
  await expect(page.locator(sel.transcript)).not.toContainText("sku-1");

  // The browser-derived projection is finalized against the active record.
  await expect
    .poll(() =>
      api.requests.filter((request) => request.path.endsWith("display-projections")).length
    )
    .toBeGreaterThan(0);
  const patch = api.requests.find((request) =>
    request.path.endsWith("display-projections")
  )!;
  expect(patch.method).toBe("PATCH");
  expect(patch.body).toEqual({
    messages: [{ id: "asst_1", displayContent: DISPLAY }],
  });
  expect(patch.headers["x-visitor-token"]).toMatch(/^cvt_/);
  // Exact-browser transport operation: never an identity-scoped read.
  expect(patch.headers["x-identity-proof"]).toBeUndefined();

  const conversationId = patch.path.split("/")[1]!;

  // What the server now holds: the model channel it stored during generation
  // plus the projection this browser just finalized, and a turn another device
  // appended afterwards (so the reload demonstrably reads from the server).
  api.setModelContent(conversationId, "asst_1", MODEL);
  api.setMessages(conversationId, [
    { id: "usr_1", role: "user", content: "show me shoes", displayAvailable: true },
    {
      id: "asst_1",
      role: "assistant",
      content: MODEL,
      displayContent: DISPLAY,
      displayAvailable: true,
    },
    {
      id: "asst_remote",
      role: "assistant",
      content: "Added from another device.",
      displayContent: "Added from another device.",
      displayAvailable: true,
    },
  ]);

  // Reload: boot resumes the record by conversationId and reconciles.
  await page.reload();
  await waitForWidget(page);

  const detailReads = () =>
    api.requests.filter(
      (request) => request.method === "GET" && request.path === `conversations/${conversationId}`
    ).length;
  await expect.poll(detailReads).toBeGreaterThan(0);

  await expect(page.locator(sel.transcript)).toContainText(DISPLAY);
  await expect(page.locator(sel.transcript)).toContainText("Added from another device.");
  // Only the projection: no fragment of the model channel reached the DOM.
  await expect(page.locator(sel.transcript)).not.toContainText("sku-1");
  await expect(page.locator(sel.transcript)).not.toContainText('"action"');
});
