import { expect, test, type Page } from "@playwright/test";
import type { AgentWidgetController } from "../../packages/widget/src/ui";

declare global {
  interface Window {
    steerController: AgentWidgetController;
    steerErrors: string[];
  }
}
const slowTool =
  '[[mock:tool name=mcp_custom_steer_fixture_slow_tool args={"delayMs":8000}]]';
async function send(page: Page, text: string) {
  const input = page.locator("textarea").first();
  await input.fill(text);
  await input.press("Enter");
}
async function boot(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.steerController);
  await expect(page.locator("textarea").first()).toBeEnabled();
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const state = await page
      .evaluate(() => ({
        messages: window.steerController?.getMessages(),
        errors: window.steerErrors,
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
    window.steerController
      .getMessages()
      .some(
        (message) =>
          message.toolCall?.name?.includes("slow_tool") &&
          message.toolCall.status !== "complete",
      ),
  );
  await expect(page.locator("[data-persona-steer-stop]")).toBeVisible();
  await send(page, "[[mock:text value=BROWSER_STEERED_OK]]");
  await expect.poll(() => responses.length).toBe(2);
  expect(responses.map((response) => response.status)).toEqual([200, 202]);
  expect(bodies.every((body) => body.submitMode === "steer")).toBe(true);
  expect(bodies.map((body) => (body.messages as unknown[]).length)).toEqual([
    1, 1,
  ]);
  await expect(
    page.locator('[data-persona-delivery="pending"]').last(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("steered-during-tool.png"),
    fullPage: true,
  });
  await page.waitForFunction(() =>
    window.steerController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("BROWSER_STEERED_OK"),
      ),
  );
  await expect(page.locator("[data-persona-steer-stop]")).toHaveCount(0);
  const messages = await page.evaluate(() =>
    window.steerController.getMessages(),
  );
  const slow = messages.filter((message) =>
    message.toolCall?.name?.includes("slow_tool"),
  );
  expect(slow).toHaveLength(1);
  expect(slow[0].toolCall?.status).toBe("complete");
  expect(await page.evaluate(() => window.steerErrors)).toEqual([]);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.steerController
            .getMessages()
            .filter((message) => message.delivery?.status === "settled").length,
      ),
    )
    .toBe(2);
  await page.screenshot({
    path: info.outputPath("steered-complete.png"),
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
    window.steerController
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
  await page.locator("[data-persona-steer-stop]").click();
  expect((await cancelled).status()).toBe(202);
  await expect(
    page.locator('[data-persona-delivery="not_applied"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Send again", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-persona-steer-stop]")).toHaveCount(0);
  expect(await page.evaluate(() => window.steerErrors)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("steer-stop-narrow.png"),
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
    window.steerController
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
        window.steerController
          .getMessages()
          .filter((message) => message.role === "user").length,
    ),
  ).toBe(1);
  await expect(page.locator('[data-persona-delivery="settled"]')).toHaveCount(
    1,
  );
  expect(await page.evaluate(() => window.steerErrors)).toEqual([]);
});

test("steering while a question is awaiting input keeps the answer sheet and resume authority", async ({
  page,
}, info) => {
  await page.goto("/?questions");
  await page.waitForFunction(() => !!window.steerController);
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
  await send(page, "[[mock:text value=QUESTION_STEER_PRESERVED]]");
  await reply;
  await expect(
    page.getByText("Which color should I use?", { exact: true }).last(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("steered-during-question.png"),
    fullPage: true,
  });
  const resumed = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/resume"),
  );
  await page.getByText("Blue", { exact: true }).last().click();
  expect((await resumed).status()).toBe(200);
  await page.waitForFunction(() =>
    window.steerController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("QUESTION_STEER_PRESERVED"),
      ),
  );
  expect(await page.evaluate(() => window.steerErrors)).toEqual([]);
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
    window.steerController
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
  await send(page, "[[mock:text value=RELOAD_STEER_RECOVERED]]");
  const admission = await (await receipt).json();
  const reattached: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/events"))
      reattached.push(request.url());
  });
  await page.reload();
  await page.waitForFunction(() => !!window.steerController);
  await page.waitForFunction(() =>
    window.steerController
      .getMessages()
      .some(
        (message) =>
          message.role === "assistant" &&
          message.content.includes("RELOAD_STEER_RECOVERED"),
      ),
  );
  expect(reattached.some((url) => url.includes(admission.executionId))).toBe(
    true,
  );
  const users = await page.evaluate(() =>
    window.steerController
      .getMessages()
      .filter((message) => message.role === "user"),
  );
  expect(
    users.filter((message) =>
      message.content.includes("RELOAD_STEER_RECOVERED"),
    ),
  ).toHaveLength(1);
  expect(
    users.filter((message) => message.content.includes("slow_tool")),
  ).toHaveLength(1);
  expect(await page.evaluate(() => window.steerErrors)).toEqual([]);
});
