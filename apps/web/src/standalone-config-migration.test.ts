// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentWidgetConfig, AgentWidgetStoredState } from "@runtypelabs/persona";
import { createActionManager, defaultJsonActionParser } from "../../../packages/widget/src/utils/actions";
import { createFlexibleJsonStreamParser } from "../../../packages/widget/src/utils/formatting";
import { resolveWelcomeConfig } from "../../../packages/widget/src/welcome";
import sample from "../standalone/sample.html?raw";
import shop from "../standalone/example-shop.html?raw";
import shopify from "../standalone/shopify.html?raw";
import metadata from "../standalone/example-shop-metadata.html?raw";
import installer from "../standalone/example-shop-installer.html?raw";
import voice from "../standalone/example-shop-installer-voice-metadata.html?raw";
import { STANDALONE_EXAMPLES } from "./standalone-nav";

type Installer = { config: AgentWidgetConfig; cssUrl: string; jsUrl: string };
declare const jsdom: { reconfigure(options: { url: string }): void };
function mount(html = shop, url = "https://store.example/standalone/example-shop.html") {
  jsdom.reconfigure({ url });
  document.documentElement.innerHTML = html;
  localStorage.clear();
  sessionStorage.clear();
  const dom = { window };
  const context = [{ interactivity: "clickable", attributes: { "data-product": "blue-tshirt" } }];
  Object.assign(dom.window, {
    AgentWidget: {
      createFlexibleJsonStreamParser,
      collectEnrichedPageContext: () => context,
      formatEnrichedContext: () => "Blue T-Shirt: .AddToCartButton-blue-tshirt",
    },
    fetch: vi.fn().mockResolvedValue({ json: async () => ({ success: true, checkoutUrl: url + "#checkout" }) }),
  });
  for (const script of dom.window.document.querySelectorAll("script[id]")) new Function(script.textContent || "")();
  const settings = (dom.window as unknown as { siteAgentConfig: Installer }).siteAgentConfig;
  return { dom, settings, config: settings.config, context };
}
function actions(config: AgentWidgetConfig, document: Document) {
  let metadata: Record<string, unknown> = {};
  const manager = createActionManager({
    parsers: [defaultJsonActionParser], handlers: config.actionHandlers || [], documentRef: document,
    getSessionMetadata: () => metadata,
    updateSessionMetadata: update => { metadata = update(metadata); },
    emit: () => {},
  });
  const process = (action: Record<string, unknown>, id = "action-1", streaming = false) => {
    const raw = JSON.stringify(action);
    return manager.process({ text: raw, raw, message: { id, role: "assistant", content: raw, createdAt: new Date().toISOString() }, streaming });
  };
  return { process, metadata: () => metadata };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.replaceChildren(); });

describe("consolidated standalone examples", () => {
  it("offers exactly four focused pages", () => {
    expect(STANDALONE_EXAMPLES.map(page => page.slug)).toEqual(["sample", "example-shop", "preview-mode", "lifecycle-events"]);
  });

  it.each([shopify, metadata, installer, voice])("redirects a retired page with query/hash intact and no widget initialization", html => {
    const page = new DOMParser().parseFromString(html, "text/html");
    const replace = vi.fn();
    const script = page.querySelector("script")?.textContent || "";
    new Function("location", script)({ replace, search: "?checkout=success", hash: "#cart" });
    expect(replace).toHaveBeenCalledWith("/standalone/example-shop.html?checkout=success#cart");
    expect(page.querySelector("a")?.getAttribute("href")).toBe("/standalone/example-shop.html");
    expect(html).not.toContain("siteAgentConfig");
  });

  it("keeps the minimal embed snippet executable and free of shopping middleware", () => {
    const { dom, config } = mount(sample, "http://127.0.0.1:5203/standalone/sample.html");
    const snippet = dom.window.document.getElementById("embed-snippet")?.textContent || "";
    const copied = new DOMParser().parseFromString(snippet, "text/html");
    const copiedWindow: { siteAgentConfig?: Installer } = {};
    new Function("window", copied.querySelector("script")?.textContent || "")(copiedWindow);
    expect(copiedWindow.siteAgentConfig?.config).toEqual(config);
    expect(config.persistState).toBe(false);
    expect(config.actionHandlers).toBeUndefined();
    expect(config.contextProviders).toBeUndefined();
    expect(config.storageAdapter).toBeUndefined();
    expect(copied.querySelector("script[src]")?.getAttribute("src")).toContain("@4/dist/install.global.js");
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("uses local assets for %s", hostname => {
    const { settings, config } = mount(shop, `http://${hostname}:5203/standalone/example-shop.html`);
    expect(settings.cssUrl).toBe("/widget-dist/widget.css");
    expect(settings.jsUrl).toBe("/widget-dist/index.global.js");
    expect(config.apiUrl).toBe("/api/chat/dispatch-metadata");
  });

  it("preserves welcome, starter layout, and opt-in voice on the canonical shop", () => {
    const { config, settings } = mount();
    expect(settings.jsUrl).toContain("@4/dist/index.global.js");
    expect(config.suggestions?.starters).toEqual({ items: ["What products do you have?", "Show me t-shirts", "Add the blue t-shirt to cart"], variant: "chip", placement: "composer", overflow: "wrap", maxItems: 4 });
    for (const v5Defaults of [false, true]) expect(resolveWelcomeConfig({ ...config, future: { v5Defaults } }).title).toBe("Welcome to our shop!");
    expect(config.voiceRecognition).toEqual({ enabled: true, autoResume: "assistant" });
  });

  it("sends fresh page context as metadata without overwriting existing metadata or user text", () => {
    const { config, context } = mount();
    const provider = config.contextProviders![0] as () => unknown;
    const details = provider();
    expect(details).toMatchObject({ dom_elements: context, shopping_element_count: 1, element_types: { products: 1, buttons: 1 } });
    // Exercise the actual inline middleware; it only depends on the payload field.
    const middleware = config.requestMiddleware as unknown as (input: { payload: Record<string, unknown> }) => Record<string, unknown>;
    const payload = middleware({ payload: { context: details, metadata: { customer: "example" }, message: "Find a shirt" } });
    expect(payload.context).toBeUndefined();
    expect(payload.metadata).toMatchObject({ customer: "example", dom_elements: context });
    expect(payload.message).toBe("Find a shirt");
  });

  it("executes completed cart actions once and retains SDK action deduplication metadata", () => {
    vi.useFakeTimers();
    const { config, dom } = mount();
    const manager = actions(config, dom.window.document);
    const action = { action: "message_and_click", element: ".AddToCartButton-blue-tshirt", text: "Added" };
    expect(manager.process(action, "cart", true)).toBeNull();
    manager.process(action, "cart");
    manager.process(action, "cart");
    vi.advanceTimersByTime(350);
    expect(dom.window.document.getElementById("cart-items")?.textContent).toBe("Blue T-Shirt × 1");
    expect(manager.metadata().processedActionMessageIds).toContain("cart");
  });

  it("persists messages, action IDs and voice metadata while clearing streaming flags", async () => {
    const { config } = mount();
    const state: AgentWidgetStoredState = { messages: [{ id: "m", role: "assistant", content: "Hello", streaming: true, createdAt: new Date().toISOString() }], metadata: { processedActionMessageIds: ["m"], voice: { active: true } } };
    await config.storageAdapter!.save!(state);
    expect(await config.storageAdapter!.load!()).toEqual({ ...state, messages: [{ ...state.messages![0], streaming: false }] });
    await config.storageAdapter!.clear!();
    expect(await config.storageAdapter!.load!()).toBeNull();
  });

  it("restores a navigation message and opens chat once, preserving prior state", () => {
    vi.useFakeTimers();
    const { config, dom } = mount();
    const manager = actions(config, dom.window.document);
    manager.process({ action: "nav_then_click", page: "/standalone/example-shop.html", on_load_text: "You have arrived" });
    const state = { messages: [], metadata: manager.metadata() };
    const result = config.onStateLoaded!(state) as { state: AgentWidgetStoredState; open: boolean };
    expect(result.open).toBe(true);
    expect(result.state.messages?.map(message => message.content)).toEqual(["You have arrived"]);
    expect(result.state.metadata?.processedActionMessageIds).toContain("action-1");
    expect(config.onStateLoaded!(result.state)).toEqual(result.state);
    expect(manager.process({ action: "nav_then_click", page: "/standalone/example-shop.html" }, "again")?.text).toContain("Please wait");
  });

  it("ignores expired navigation and rejects cross-origin destinations", () => {
    vi.useFakeTimers();
    const { config, dom } = mount();
    const manager = actions(config, dom.window.document);
    expect(manager.process({ action: "nav_then_click", page: "https://another.example" })?.text).toContain("this storefront");
    expect(config.onStateLoaded!({ metadata: { navigation: { targetUrl: dom.window.location.href, timestamp: Date.now() - 31000, text: "Old" } } })).toEqual({ metadata: {} });
  });

  it("forwards checkout items to the backend and follows its returned URL", async () => {
    const { config, dom } = mount();
    const items = [{ name: "Blue T-Shirt", price: 2999, quantity: 1 }];
    actions(config, dom.window.document).process({ action: "checkout", items });
    await vi.waitFor(() => expect(dom.window.location.hash).toBe("#checkout"));
    expect(dom.window.fetch).toHaveBeenCalledWith("https://proxy.persona-chat.dev/api/checkout", expect.objectContaining({ method: "POST", body: JSON.stringify({ items }) }));
  });
});
