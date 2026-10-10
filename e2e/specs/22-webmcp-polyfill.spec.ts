import { expect, test } from "@playwright/test";
import { sseEvent, textTurnStream } from "../fixtures/fake-history-api";

// Only the HTTP boundary is scripted. The storefront registers real v6 tools;
// Persona discovers them, asks for approval, executes and resumes normally.
for (const approve of [true, false]) {
  test(`WebMCP v6 storefront ${
    approve ? "executes approved" : "does not execute denied"
  } tools`, async ({ page }) => {
    const requests: Array<{ resume: boolean; body: Record<string, unknown> }> =
      [];
    await page.route("**/api/chat/dispatch-webmcp**", async (route) => {
      const request = route.request();
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "content-type": "text/event-stream",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const resume = request.url().endsWith("/resume");
      requests.push({ resume, body: request.postDataJSON() });
      const body = resume
        ? textTurnStream(
            approve ? "Added to your cart." : "Nothing added.",
            "exec_webmcp"
          )
        : sseEvent("execution_start", {
            executionId: "exec_webmcp",
            kind: "agent",
            agentId: "test",
            startedAt: new Date().toISOString(),
          }) +
          sseEvent("await", {
            executionId: "exec_webmcp",
            awaitReason: "local_tool_required",
            toolCallId: "call_cart",
            toolName: "webmcp:add_to_cart",
            parameters: { sku: "SHOE-001", quantity: 2 },
          });
      await route.fulfill({ status: 200, headers, body });
    });

    await page.goto("/webmcp-demo.html");
    if (approve) {
      // A same-origin child exposes the same tool names through v6 discovery.
      // Persona must still send and execute only the parent document's tools.
      await page.evaluate(() => {
        const frame = document.createElement("iframe");
        frame.id = "other-storefront";
        frame.src = "/webmcp-demo.html";
        document.body.append(frame);
      });
      await expect(
        page
          .frameLocator("#other-storefront")
          .getByPlaceholder("Find me a trail shoe…")
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const context = (
              document as Document & {
                modelContext: { getTools(): Promise<unknown[]> };
              }
            ).modelContext;
            return (await context.getTools()).length;
          })
        )
        .toBeGreaterThan(5);
    }
    const composer = page.getByPlaceholder("Find me a trail shoe…");
    await composer.fill("Add two SHOE-001 shoes to my cart");
    await composer.press("Enter");
    await expect(
      page.getByRole("button", { name: "Allow", exact: true })
    ).toBeVisible();
    await expect(page.locator("#shop-cart")).toContainText(
      "Your cart is empty"
    );
    await page
      .getByRole("button", { name: approve ? "Allow" : "Deny", exact: true })
      .click();
    await expect(
      page.getByText(approve ? "Added to your cart." : "Nothing added.", {
        exact: true,
      })
    ).toBeVisible();

    expect(requests).toHaveLength(2);
    expect(requests[0]!.body.clientTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "add_to_cart",
          parametersSchema: expect.objectContaining({ type: "object" }),
        }),
      ])
    );
    const tools = requests[0]!.body.clientTools as Array<{ name: string }>;
    expect(tools.filter((tool) => tool.name === "add_to_cart")).toHaveLength(1);
    expect(requests[1]!.resume).toBe(true);
    const outputs = requests[1]!.body.toolOutputs as Record<
      string,
      { isError?: boolean; content: Array<{ text: string }> }
    >;
    const output = outputs.call_cart!;
    if (approve) {
      expect(output.isError).not.toBe(true);
      expect(output.content[0]!.text).toContain('"added":true');
      await expect(page.locator("#shop-cart .shop-cart-line")).toHaveCount(1);
      await expect(
        page.frameLocator("#other-storefront").locator("#shop-cart")
      ).toContainText("Your cart is empty");
    } else {
      expect(output.isError).toBe(true);
      await expect(page.locator("#shop-cart")).toContainText(
        "Your cart is empty"
      );
    }
  });
}

test("calendar MCP-B runtime exposes executable object-input tools", async ({
  page,
}) => {
  await page.goto("/webmcp-calendar.html");
  const result = await page.evaluate(async () => {
    const context = (
      document as Document & {
        modelContext: {
          getTools(): Promise<Array<{ name: string }>>;
          executeTool(tool: { name: string }, input: object): Promise<string>;
        };
      }
    ).modelContext;
    const tools = await context.getTools();
    const tool = tools.find(
      (candidate) => candidate.name === "get_calendar_state"
    );
    if (!tool) throw new Error("Calendar state tool was not registered");
    return JSON.parse(await context.executeTool(tool, {}));
  });
  expect(result.structuredContent).toMatchObject({
    selectedDate: expect.any(String),
    users: expect.any(Array),
    eventCount: expect.any(Number),
  });
});
