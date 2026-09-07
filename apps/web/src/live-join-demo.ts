import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";
import { renderDemoScaffold } from "./demo-scaffold";
import { createDemoConfigInspector } from "./demo-config-inspector";
import { runWidgetMountWithInspector, setupMountMode } from "./mount-mode";
import {
  LIVE_JOIN_DEMO_ORIGIN,
  createLiveJoinDemoTransport,
} from "./live-join-demo-transport";
import type { Mode } from "./examples-nav";

const token = import.meta.env.VITE_LIVE_JOIN_CLIENT_TOKEN?.trim();
const live = Boolean(token);
const scaffold = renderDemoScaffold({ slug: "live-join-demo" });
const inspector = createDemoConfigInspector({ title: "Live input joining" });
const log = document.querySelector<HTMLElement>("[data-join-log]")!;
const lines: string[] = [];
let controller: AgentWidgetController | undefined;
let transport: ReturnType<typeof createLiveJoinDemoTransport> | undefined;
let reset = () => {};
const originalFetch = window.fetch;
const scopedFetch: typeof fetch = (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  return url.origin === LIVE_JOIN_DEMO_ORIGIN && transport
    ? transport.fetch(input, init)
    : originalFetch.call(window, input, init);
};
if (!live) window.fetch = scopedFetch;
else {
  document.querySelector("[data-source-label]")!.textContent =
    "Live durable agent";
  document.querySelector("[data-source-description]")!.textContent =
    "Connected to your configured Runtype agent. Requests use its real tools and may incur model spend. The eight-second tool is simulation-only.";
  document.querySelector<HTMLElement>("[data-lose-ack]")!.hidden = true;
  document.querySelector<HTMLElement>("[data-log-section]")!.hidden = true;
}
const config = (mode: Mode): AgentWidgetConfig => ({
  ...DEFAULT_WIDGET_CONFIG,
  clientToken: token || "demo-client-token-not-a-credential",
  apiUrl: live
    ? import.meta.env.VITE_LIVE_JOIN_API_URL || "https://api.runtype.com"
    : LIVE_JOIN_DEMO_ORIGIN,
  persistState: false,
  composer: { streamingSubmitBehavior: "join" },
  welcome: {
    title: "Keep the conversation moving",
    subtitle:
      "Send a request. Add a detail while I’m working — no need to wait.",
    variant: "hero",
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: mode === "launcher",
    width: mode === "launcher" ? "min(420px, 94vw)" : "100%",
    title: "Live input joining",
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    inputPlaceholder: "Send a request or add another detail…",
  },
  features: {
    ...DEFAULT_WIDGET_CONFIG.features,
    toolCallDisplay: { activePreview: true },
  },
});
setupMountMode({
  slug: "live-join-demo",
  modes: ["inline", "launcher"],
  mount(mode, { stage }) {
    let teardown: (() => void) | undefined;
    const mount = () => {
      teardown?.();
      transport?.dispose();
      lines.length = 0;
      log.textContent = "Ready. Start a request, then add a detail.";
      transport = live
        ? undefined
        : createLiveJoinDemoTransport({
            onEvent(message) {
              lines.push(message);
              log.textContent = lines.slice(-20).join("\n");
            },
          });
      const mounted = runWidgetMountWithInspector(
        inspector,
        mode,
        stage,
        config,
      );
      controller = mounted.controller;
      teardown = mounted.teardown;
    };
    reset = mount;
    mount();
    return () => {
      teardown?.();
      transport?.dispose();
      transport = undefined;
      controller = undefined;
    };
  },
});
const send = (text: string) => {
  controller?.open();
  controller?.submitMessage(text);
};
document
  .querySelector("[data-start]")!
  .addEventListener("click", () =>
    send("Find a quiet table for two on Friday evening."),
  );
document
  .querySelector("[data-followup]")!
  .addEventListener("click", () =>
    send("One guest is vegetarian, and an outdoor table would be ideal."),
  );
document
  .querySelector("[data-lose-ack]")!
  .addEventListener("click", () => transport?.loseNextAcknowledgement());
document
  .querySelector("[data-reset]")!
  .addEventListener("click", () => reset());
const onPageHide = () => {
  controller?.destroy();
  transport?.dispose();
  if (window.fetch === scopedFetch) window.fetch = originalFetch;
};
const onPageShow = (event: PageTransitionEvent) => {
  if (!event.persisted) return;
  if (!live) window.fetch = scopedFetch;
  reset();
};
window.addEventListener("pagehide", onPageHide);
window.addEventListener("pageshow", onPageShow);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    controller?.destroy();
    transport?.dispose();
    scaffold.destroy();
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    if (window.fetch === scopedFetch) window.fetch = originalFetch;
  });
