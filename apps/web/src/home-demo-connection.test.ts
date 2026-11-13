// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentExperience,
  type AgentWidgetConfig,
  type AgentWidgetRealtimeConnectHook,
} from "@runtypelabs/persona";
import { homeDemoConnection } from "./home-demo-connection";

const PROXY_URL = "http://localhost:43111/api/chat/dispatch-docs";
const ENV = {
  VITE_RUNTYPE_CLIENT_TOKEN: "ct_test_home",
  VITE_RUNTYPE_DOCS_AGENT_ID: "agent_test_home",
  VITE_RUNTYPE_API_URL: "https://api.example.test",
};

let controller: ReturnType<typeof createAgentExperience> | undefined;

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Mount the widget with the home page's connection, counting session inits, other requests and sockets. */
function mountHome(connection: ReturnType<typeof homeDemoConnection>) {
  const inits: string[] = [];
  const otherRequests: string[] = [];
  const sockets: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/v1/client/init")) {
        // A minted visitor is claimed by an immediate second request; count the first only.
        if (!String(init?.body ?? "").includes('"sessionId"')) inits.push(String(url));
        return Response.json({
          sessionId: "session-1",
          conversationId: "conv-1",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          flow: { id: "agent-1", name: "Agent", description: null },
          config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
          durableRecovery: { enabled: true },
          visitor: { token: "cvt_test_visitor" },
          realtime: { protocol: "runtype-client-session-v1", url: "wss://api.example.test/v1/client/socket" },
        });
      }
      otherRequests.push(String(url));
      return new Response("", { status: 404 });
    })
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      readyState = 0;
      constructor(url: string) {
        sockets.push(url);
      }
      addEventListener() {}
      removeEventListener() {}
      send() {}
      close() {}
    }
  );
  // The widget installs the connect hook once its lazy transport chunk loads; resolve when it does.
  let hookInstalled: () => void = () => {};
  const installed = new Promise<void>((resolve) => (hookInstalled = resolve));
  const pageRealtime = typeof connection.realtime === "object" ? connection.realtime : undefined;
  const pageHook = typeof pageRealtime?.connect === "function" ? pageRealtime.connect : undefined;
  const realtime = pageHook
    ? {
        ...pageRealtime,
        connect: (context: Parameters<AgentWidgetRealtimeConnectHook>[0]) => {
          hookInstalled();
          return pageHook(context);
        },
      }
    : undefined;
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    ...connection,
    ...(realtime ? { realtime } : {}),
    launcher: { enabled: false },
    persistState: false,
  } as AgentWidgetConfig);
  return { mount, inits, otherRequests, sockets, installed };
}

describe("home page chat connection", () => {
  it("uses the proxy route, with no socket config, when the token or agent id is missing", () => {
    expect(homeDemoConnection({}, PROXY_URL)).toEqual({ apiUrl: PROXY_URL });
    expect(homeDemoConnection({ VITE_RUNTYPE_CLIENT_TOKEN: "ct_only" }, PROXY_URL)).toEqual({ apiUrl: PROXY_URL });
    expect(homeDemoConnection({ VITE_RUNTYPE_DOCS_AGENT_ID: "agent_only" }, PROXY_URL)).toEqual({ apiUrl: PROXY_URL });
  });

  it("spends nothing on a page view, then starts the session and opens the socket on hover", async () => {
    const page = mountHome(homeDemoConnection(ENV, PROXY_URL));
    await page.installed;
    await settle();
    expect(page.inits).toEqual([]);
    expect(page.sockets).toEqual([]);

    page.mount.dispatchEvent(new Event("pointerenter"));
    await vi.waitFor(() => expect(page.sockets).toHaveLength(1));
    expect(page.inits).toEqual(["https://api.example.test/v1/client/init"]);
    expect(page.sockets[0]).toMatch(/^wss:\/\/api\.example\.test\/v1\/client\/socket\?/);
  });

  it("starts the session and opens the socket on a keydown for keyboard users", async () => {
    const page = mountHome(homeDemoConnection(ENV, PROXY_URL));
    await page.installed;
    page.mount.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    await vi.waitFor(() => expect(page.sockets).toHaveLength(1));
    expect(page.inits).toHaveLength(1);
  });

  it("does nothing on hover on the proxy fallback", async () => {
    const page = mountHome(homeDemoConnection({}, PROXY_URL));
    await settle();
    page.mount.dispatchEvent(new Event("pointerenter"));
    page.mount.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await settle();
    expect(page.inits).toEqual([]);
    expect(page.otherRequests).toEqual([]);
    expect(page.sockets).toEqual([]);
  });
});
