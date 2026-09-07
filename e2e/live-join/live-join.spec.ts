import { expect, test, type Page } from "@playwright/test";
import type { AgentWidgetController } from "../../packages/widget/src/ui";

declare global {
  interface Window {
    joinController: AgentWidgetController;
    joinErrors: string[];
  }
}
const slowTool =
  '[[mock:tool name=mcp_custom_join_fixture_slow_tool args={"delayMs":8000}]]';
async function send(page: Page, text: string) {
  const input = page.locator("textarea").first();
  await input.fill(text);
  await input.press("Enter");
}
async function boot(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.joinController);
  await expect(page.locator("textarea").first()).toBeEnabled();
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const state = await page
      .evaluate(() => ({
        messages: window.joinController?.getMessages(),
        errors: window.joinErrors,
      }))
      .catch(() => null);
    await info.attach("widget-state", {
      body: JSON.stringify(state, null, 2),
      contentType: "application/json",
    });
  }
});

test("real MCP work keeps running while the widget adds input and receives a separate receipt", async ({
  page,
}, info) => {
  const bodies: Array<Record<string, unknown>> = [];
  const responses: Array<{
    status: number;
    executionId: string | null;
    deliveryId: string | null;
  }> = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/v1/client/chat")
      bodies.push(request.postDataJSON());
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/v1/client/chat")
      responses.push({
        status: response.status(),
        executionId: response.headers()["x-runtype-execution-id"] || null,
        deliveryId: response.headers()["x-runtype-delivery-id"] || null,
      });
  });
  await boot(page);
  await send(page, slowTool);
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.toolCall?.name?.includes("slow_tool") &&
          message.toolCall.status !== "complete",
      ),
  );
  await expect(page.locator("[data-persona-join-stop]")).toBeVisible();
  await send(page, "[[mock:text value=BROWSER_JOINED_OK]]");
  await expect.poll(() => responses.length).toBe(2);
  expect(responses.map((response) => response.status)).toEqual([200, 202]);
  expect(bodies.every((body) => body.submitMode === "join")).toBe(true);
  expect(bodies.map((body) => (body.messages as unknown[]).length)).toEqual([
    1, 1,
  ]);
  await expect(
    page.locator('[data-persona-delivery="pending"]').last(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("joined-during-tool.png"),
    fullPage: true,
  });
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("BROWSER_JOINED_OK"),
      ),
  );
  await expect(page.locator("[data-persona-join-stop]")).toHaveCount(0);
  const messages = await page.evaluate(() =>
    window.joinController.getMessages(),
  );
  const slow = messages.filter((message) =>
    message.toolCall?.name?.includes("slow_tool"),
  );
  expect(slow).toHaveLength(1);
  expect(slow[0].toolCall?.status).toBe("complete");
  expect(await page.evaluate(() => window.joinErrors)).toEqual([]);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.joinController
            .getMessages()
            .filter((message) => message.delivery?.status === "settled").length,
      ),
    )
    .toBe(2);
  await page.screenshot({
    path: info.outputPath("joined-complete.png"),
    fullPage: true,
  });
});

test("explicit Stop cancels the durable host and marks queued input not applied on a narrow viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await send(page, slowTool);
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.toolCall?.name?.includes("slow_tool") &&
          message.toolCall.status !== "complete",
      ),
  );
  const receipt = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/client/chat" &&
      response.status() === 202,
  );
  await send(page, "[[mock:text value=SHOULD_NOT_APPLY]]");
  await receipt;
  const cancelled = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/cancel"),
  );
  await page.locator("[data-persona-join-stop]").click();
  expect((await cancelled).status()).toBe(202);
  await expect(
    page.locator('[data-persona-delivery="not_applied"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Send again", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-persona-join-stop]")).toHaveCount(0);
  expect(await page.evaluate(() => window.joinErrors)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("join-stop-narrow.png"),
    fullPage: true,
  });
});

test("a lost admission acknowledgement retries the same delivery without another tool call", async ({
  page,
}) => {
  let loseAcknowledgement = true;
  const ids: string[] = [];
  await page.route("**/v1/client/chat", async (route) => {
    ids.push(route.request().postDataJSON().turnId);
    if (!loseAcknowledgement) return route.continue();
    loseAcknowledgement = false;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await boot(page);
  await send(page, "[[mock:text value=LOST_ACK_RECOVERED]]");
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("LOST_ACK_RECOVERED"),
      ),
  );
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(
    await page.evaluate(
      () =>
        window.joinController
          .getMessages()
          .filter((message) => message.role === "user").length,
    ),
  ).toBe(1);
  await expect(page.locator('[data-persona-delivery="settled"]')).toHaveCount(
    1,
  );
  expect(await page.evaluate(() => window.joinErrors)).toEqual([]);
});

test("joining while a question is awaiting input keeps the answer sheet and resume authority", async ({
  page,
}, info) => {
  await page.goto("/?questions");
  await page.waitForFunction(() => !!window.joinController);
  await expect(page.locator("textarea").first()).toBeEnabled();
  await send(
    page,
    '[[mock:tool name=ask_user_question args={"questions":[{"question":"Which color should I use?","options":[{"label":"Blue"},{"label":"Green"}]}]}]]',
  );
  await expect(
    page.getByText("Which color should I use?", { exact: true }).last(),
  ).toBeVisible();
  const reply = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/client/chat" &&
      response.status() === 202,
  );
  await send(page, "[[mock:text value=QUESTION_JOIN_PRESERVED]]");
  await reply;
  await expect(
    page.getByText("Which color should I use?", { exact: true }).last(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("joined-during-question.png"),
    fullPage: true,
  });
  const resumed = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/resume"),
  );
  await page.getByText("Blue", { exact: true }).last().click();
  expect((await resumed).status()).toBe(200);
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("QUESTION_JOIN_PRESERVED"),
      ),
  );
  expect(await page.evaluate(() => window.joinErrors)).toEqual([]);
  await expect(page.locator('[data-persona-delivery="settled"]')).toHaveCount(
    2,
  );
});

test("reloading after admission restores history and resumes the same durable execution", async ({
  page,
}) => {
  await boot(page);
  await send(page, slowTool);
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.toolCall?.name?.includes("slow_tool") &&
          message.toolCall.status !== "complete",
      ),
  );
  const receipt = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/client/chat" &&
      response.status() === 202,
  );
  await send(page, "[[mock:text value=RELOAD_JOIN_RECOVERED]]");
  const admission = await (await receipt).json();
  const reattached: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/events"))
      reattached.push(request.url());
  });
  await page.reload();
  await page.waitForFunction(() => !!window.joinController);
  await page.waitForFunction(() =>
    window.joinController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("RELOAD_JOIN_RECOVERED"),
      ),
  );
  expect(reattached.some((url) => url.includes(admission.executionId))).toBe(
    true,
  );
  const users = await page.evaluate(() =>
    window.joinController
      .getMessages()
      .filter((message) => message.role === "user"),
  );
  expect(
    users.filter((message) =>
      message.content.includes("RELOAD_JOIN_RECOVERED"),
    ),
  ).toHaveLength(1);
  expect(
    users.filter((message) => message.content.includes("slow_tool")),
  ).toHaveLength(1);
  expect(await page.evaluate(() => window.joinErrors)).toEqual([]);
});
