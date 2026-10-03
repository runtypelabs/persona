import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

/**
 * Internal fixture page for the Playwright full-duplex voice suite (see
 * e2e/specs/voice-*.spec.ts) and the live GPT-Live harness (e2e/live/).
 *
 * Mounts a clientToken widget whose chat traffic goes to `apiUrl` (route
 * intercepted by the deterministic suite, a real Runtype API in the live
 * harness) and whose `runtype` voice provider dials `voiceHost`. Not
 * registered in examples-nav.
 */

const params = new URLSearchParams(window.location.search);
const apiUrl = params.get("apiUrl") ?? "/e2e-api";
const clientToken = params.get("clientToken") ?? "ct_e2e_voice";
const agentId = params.get("agentId") ?? "agent_e2e_voice";
const voiceHost = params.get("voiceHost") ?? apiUrl;
const callContext = params.get("callContext") ?? undefined;
const clientDelegation = params.get("clientDelegation") === "0" ? false : undefined;
const approvalTimeoutMs = params.has("approvalTimeoutMs") ? Number(params.get("approvalTimeoutMs")) : undefined;
const disclosure = params.get("disclosureText");
const disclosureText = disclosure === "0" ? false : (disclosure ?? undefined);

// Live harness only (`?webmcp=1`, LIVE_WEBMCP=1): a gated `place_pickup_order`
// page tool, so a spoken order parks on a WebMCP approval in the chat.
const webmcpDemo = params.get("webmcp") === "1";
if (webmcpDemo) {
  initializeWebMCPPolyfill();
  const orders = document.createElement("div");
  orders.id = "demo-orders";
  orders.textContent = "Bakery website: no orders yet";
  document.body.prepend(orders);
  (document as unknown as { modelContext: { registerTool: (tool: unknown) => void } }).modelContext.registerTool({
    name: "place_pickup_order",
    title: "Place pickup order",
    description:
      "Place a pickup order at Juniper Bakery on the bakery website. Requires the customer's name, the items with quantities, and a pickup time during opening hours. The customer approves it in the chat first.",
    inputSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { item: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
            required: ["item", "quantity"],
          },
        },
        pickup_time: { type: "string", description: "e.g. 'today 4pm'" },
      },
      required: ["customer_name", "items", "pickup_time"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args: { customer_name: string; items: { item: string; quantity: number }[]; pickup_time: string }) => {
      // A real order call takes a moment.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const items = (args.items ?? []).map(({ item, quantity }) => `${quantity} × ${item}`);
      const orderId = `JB-${Math.floor(1000 + Math.random() * 9000)}`;
      orders.textContent = `Bakery website: order ${orderId} for ${args.customer_name}, ${items.join(", ")}, pickup ${args.pickup_time}`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ orderId, customer: args.customer_name, items, pickupTime: args.pickup_time, status: "confirmed" }),
          },
        ],
      };
    },
  });
}

const host = document.getElementById("e2e-host") as HTMLElement;
const status = document.getElementById("e2e-status") as HTMLElement;

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl,
  clientToken,
  agentId,
  persistState: false,
  suggestionChips: [],
  launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%" },
  // A welcome hero would sit between the tests and the transcript.
  welcome: { variant: "none" },
  copy: { ...DEFAULT_WIDGET_CONFIG.copy, inputPlaceholder: "Send a message…" },
  ...(webmcpDemo ? { webmcp: { enabled: true } } : {}),
  voiceRecognition: {
    enabled: true,
    provider: {
      type: "runtype",
      runtype: {
        agentId,
        host: voiceHost,
        ...(clientDelegation === false ? { clientDelegation } : {}),
        ...(callContext ? { callContext } : {}),
        ...(approvalTimeoutMs ? { approvalTimeoutMs } : {}),
        ...(disclosureText !== undefined ? { disclosureText } : {}),
      },
    },
  },
};

const controller: AgentWidgetController = initAgentWidget({
  target: host,
  useShadowDom: false,
  config,
});

status.textContent = `ready voiceHost=${voiceHost}`;

Object.assign(window as unknown as Record<string, unknown>, {
  __personaE2E: { controller },
});
