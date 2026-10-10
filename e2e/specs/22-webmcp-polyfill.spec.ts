import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { sseEvent, textTurnStream } from "../fixtures/fake-history-api";

// Only the HTTP boundary is scripted. Test the actual published runtimes:
// either the host's preinstalled v5 or the storefront's explicitly installed v6.
const legacyPolyfill = readFileSync(
  createRequire(
    resolve(__dirname, "../../packages/widget/package.json")
  ).resolve("webmcp-polyfill-v5/iife"),
  "utf8"
);
for (const version of ["v5", "v6"]) {
  for (const approve of [true, false]) {
    test(`WebMCP ${version} storefront ${
      approve ? "executes approved" : "does not execute denied"
    } tools`, async ({ page }) => {
      const requests: Array<{
        resume: boolean;
        body: Record<string, unknown>;
      }> = [];
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

      if (version === "v5")
        await page.addInitScript({ content: legacyPolyfill });
      await page.goto("/webmcp-demo.html");
      if (version === "v5") {
        expect(
          await page.evaluate(
            () =>
              (
                document as Document & {
                  modelContext: { __isWebMCPPolyfill?: boolean };
                }
              ).modelContext.__isWebMCPPolyfill
          )
        ).toBe(true);
      }
      if (approve && version === "v6") {
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
      expect(tools.filter((tool) => tool.name === "add_to_cart")).toHaveLength(
        1
      );
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
        if (version === "v6") {
          await expect(
            page.frameLocator("#other-storefront").locator("#shop-cart")
          ).toContainText("Your cart is empty");
        }
      } else {
        expect(output.isError).toBe(true);
        await expect(page.locator("#shop-cart")).toContainText(
          "Your cart is empty"
        );
      }
    });
  }
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

test("storefront rejects invalid quantities without mutating the cart", async ({
  page,
}) => {
  await page.goto("/webmcp-demo.html");
  const results = await page.evaluate(async () => {
    const context = (
      document as Document & {
        modelContext: {
          getTools(): Promise<Array<{ name: string }>>;
          executeTool(tool: { name: string }, input: object): Promise<string>;
        };
      }
    ).modelContext;
    const tools = await context.getTools();
    const add = tools.find((tool) => tool.name === "add_to_cart")!;
    const remove = tools.find((tool) => tool.name === "remove_from_cart")!;
    await context.executeTool(add, { sku: "SHOE-001", quantity: 3 });
    const before = document.getElementById("shop-cart")!.textContent;
    const results = [];
    for (const quantity of [-1, 0, 1.5, "2", null, NaN, Infinity]) {
      for (const tool of [add, remove]) {
        results.push(
          JSON.parse(
            await context.executeTool(tool, { sku: "SHOE-001", quantity })
          )
        );
      }
    }
    return {
      results,
      before,
      after: document.getElementById("shop-cart")!.textContent,
    };
  });
  expect(results.results).toHaveLength(14);
  for (const result of results.results) expect(result.isError).toBe(true);
  expect(results.after).toBe(results.before);
});

for (const modern of [true, false]) {
  test(`CDN fallback ${
    modern ? "installs v6 with upstream result semantics" : "stays inert without the v6 browser baseline"
  }`, async ({ page }) => {
    await page.route("**/webmcp-compat-fixture", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><body></body>",
      })
    );
    await page.goto("/webmcp-compat-fixture");
    const result = await page.evaluate(async (modern) => {
      if (!modern) {
        Object.defineProperty(Promise, "withResolvers", {
          value: undefined,
          configurable: true,
        });
      }
      const runtimeUrl = "/widget-dist/webmcp-runtime.js";
      const polyfillUrl = "/widget-dist/webmcp-polyfill.js";
      const { WebMcpBridge } = await import(runtimeUrl);
      let loads = 0;
      const bridge = new WebMcpBridge(
        { enabled: true, onConfirm: async () => true },
        {
          recordToolDisplayTitles: () => {},
          getToolDisplayTitle: () => undefined,
          loadPolyfill: async () => {
            loads++;
            return import(polyfillUrl);
          },
        }
      );
      await bridge.snapshotForDispatch();
      const context = (
        document as Document & {
          modelContext?: {
            registerTool(tool: {
              name: string;
              description: string;
              execute: (input: object) => unknown;
            }): Promise<void>;
          };
        }
      ).modelContext;
      if (!context) {
        return { installed: false, operational: bridge.isOperational(), loads };
      }
      await context.registerTool({
        name: "echo",
        description: "Echo input",
        execute: (input) => ({ received: input }),
      });
      await context.registerTool({
        name: "silent",
        description: "Returns nothing",
        execute: () => undefined,
      });
      return {
        installed: true,
        operational: bridge.isOperational(),
        loads,
        echo: await bridge.executeToolCall("webmcp:echo", { quantity: 2 }),
        silentIsError: (await bridge.executeToolCall("webmcp:silent", {}))
          .isError,
        navigatorAlias: "modelContext" in navigator,
      };
    }, modern);
    if (modern) {
      expect(result).toEqual({
        installed: true,
        operational: true,
        loads: 1,
        echo: {
          content: [{ type: "text", text: '{"received":{"quantity":2}}' }],
        },
        silentIsError: true,
        navigatorAlias: false,
      });
    } else {
      expect(result).toEqual({ installed: false, operational: false, loads: 1 });
    }
  });
}
