// WebMCP flight-booking demo ("Skylark Air") — a multi-step booking form the
// embedded Persona widget and the human fill together through the page's WebMCP
// tools. See tools.ts for the tool surface (search, select, passengers, seat
// map, seat assignment, and the approval-gated confirm).
import "@runtypelabs/persona/widget.css";
import "./style.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext`; it must be initialized before tools register.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { BookingStore } from "./store";
import { createApp } from "./app";
import { buildSeatMap, findSeat } from "./catalog";
import {
  APPROVAL_REQUIRED_TOOL_NAMES,
  setupFlightTools,
} from "./tools";

initializeWebMCPPolyfill();

const store = new BookingStore();

const dockTarget = document.querySelector<HTMLElement>("#booking-dock-target");

if (!dockTarget) {
  console.warn("[Flights] Missing #booking-dock-target in webmcp-flights.html");
} else {
  const { flash } = createApp(store, dockTarget);
  setupFlightTools(store, flash);

  // Proxy mode, like the other example demos — the agent is defined in code as
  // WEBMCP_FLIGHTS_FLOW (packages/proxy/src/flows/webmcp-flights.ts) and the
  // local proxy mounts it at /api/chat/dispatch-flights (see
  // examples/runtype-hono-proxy/src/app.ts). No hosted agent or client token needed.
  const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
  const proxyApiUrl = import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-flights`
    : `http://localhost:${proxyPort}/api/chat/dispatch-flights`;

  // User-facing summary copy for tool approval bubbles. Returning undefined
  // falls back to Persona's humanized default ("The assistant wants to use …").
  const describeFlightsApproval = ({
    toolName,
  }: {
    toolName?: string;
    parameters?: unknown;
  }): string | undefined => {
    const name = String(toolName ?? "").replace(/^webmcp[:_]/, "");
    switch (name) {
      case "confirm_booking": {
        const total = store.totalPrice((a) => {
          const f = store.findFlight(a.flightId);
          return f ? findSeat(buildSeatMap(f.id, f.cabin), a.seat)?.price ?? 0 : 0;
        });
        const pax = store.booking.passengers.length;
        return `Book this trip for ${pax} passenger${pax === 1 ? "" : "s"} — total $${total}? This finalizes the booking.`;
      }
      case "reset_booking":
        return "Clear the entire booking and start over?";
      default:
        return undefined;
    }
  };

  const skylarkTheme = {
    semantic: {
      colors: {
        primary: "#0f1f3a",
        accent: "#1d4ed8",
        surface: "#ffffff",
        background: "#ffffff",
        container: "#eef2f8",
        text: "#0f1f3a",
        textMuted: "#5b6b86",
        textInverse: "#ffffff",
        border: "#d9e0ec",
        divider: "#d9e0ec",
      },
    },
    components: {
      panel: { borderRadius: "0", border: "none", shadow: "none" },
      header: {
        borderRadius: "0",
        background: "#ffffff",
        titleForeground: "#0f1f3a",
        subtitleForeground: "#5b6b86",
        iconBackground: "#1d4ed8",
        iconForeground: "#ffffff",
        borderBottom: "1px solid #d9e0ec",
      },
      message: {
        user: {
          background: "#0f1f3a",
          text: "#ffffff",
          borderRadius: "16px",
          shadow: "none",
        },
        assistant: {
          background: "#eef2f8",
          text: "#0f1f3a",
          border: "#d9e0ec",
          borderRadius: "16px",
          shadow: "none",
        },
      },
      approval: {
        approve: {
          background: "#1d4ed8",
          foreground: "#ffffff",
          border: "#1d4ed8",
          borderRadius: "999px",
        },
        deny: {
          background: "#ffffff",
          foreground: "#b91c1c",
          border: "#d9e0ec",
          borderRadius: "999px",
        },
      },
      toolBubble: { shadow: "none" },
    },
  };

  const widget = initAgentWidget({
    target: dockTarget,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl: proxyApiUrl,
      storageAdapter: createLocalStorageAdapter("persona-state-webmcp-flights"),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: "light",
      theme: skylarkTheme,
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Ask the Skylark Copilot",
        welcomeSubtitle:
          "I search flights, fill passenger details, and pick seats by what you want — all through the page's WebMCP tools. I only book once you say so.",
        inputPlaceholder: "Find a flight, add passengers, pick seats…",
      },
      suggestionChips: [
        "Find a flight from SFO to JFK in two weeks for 2 people",
        "Passengers are Jane Doe (1990-04-12) and John Doe (1988-09-30)",
        "Put us in two window seats together near the front",
        "What's left to do before we can book?",
      ],
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: "docked",
        dock: {
          side: "right",
          width: "420px",
          reveal: "emerge",
          animate: true,
        },
        autoExpand: true,
        mobileBreakpoint: 1080,
        title: "Skylark Copilot",
        subtitle: "Flight booking assistant",
      },
      webmcp: {
        enabled: true,
        // Reads and form fills auto-approve so the user can watch the Copilot
        // build the booking; only the irreversible commit/reset confirm.
        autoApprove: (info) => !APPROVAL_REQUIRED_TOOL_NAMES.has(info.toolName),
      },
      features: {
        ...DEFAULT_WIDGET_CONFIG.features,
        // Advertise the built-in ask_user_question tool so the Copilot can ask
        // structured clarifying questions (answer-pill sheet) mid-task — e.g.
        // "aisle or window?" when the traveler hasn't said.
        askUserQuestion: { expose: true },
      },
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: "Confirm with Skylark?",
        approveLabel: "Book it",
        denyLabel: "Not yet",
        detailsDisplay: "collapsed",
        formatDescription: describeFlightsApproval,
      },
      // Fresh booking state rides along with every message, so "book us in
      // window seats" needs no extra read round-trip. The flow prompt
      // interpolates {{booking_context}}.
      contextProviders: [
        () => ({
          booking_context: JSON.stringify({
            search: store.booking.search,
            selectedFlights: {
              outbound: store.booking.selectedFlights.outbound?.id ?? null,
              return: store.booking.selectedFlights.return?.id ?? null,
            },
            resultCount: store.booking.results.length,
            passengers: store.booking.passengers.map((p) => ({
              id: p.id,
              name: `${p.firstName} ${p.lastName}`.trim(),
              hasDob: Boolean(p.dateOfBirth),
            })),
            seatAssignments: store.booking.seatAssignments,
            confirmed: Boolean(store.booking.confirmation),
          }),
        }),
      ],
      // The provider's output lands in `payload.context`, but the proxy only
      // forwards `inputs`/`metadata` to the flow. Move it into `inputs` so
      // {{booking_context}} resolves in WEBMCP_FLIGHTS_FLOW's prompt.
      requestMiddleware: ({ payload }) => {
        const ctx = payload.context;
        if (!ctx) return payload;
        return {
          ...payload,
          inputs: { ...payload.inputs, ...ctx },
          context: undefined,
        };
      },
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: "Copilot can make mistakes. Review your trip before booking.",
        connectedText: "Copilot can make mistakes. Review your trip before booking.",
        connectingText: "Connecting Skylark Copilot…",
        errorText: "Skylark Copilot connection error",
      },
    },
  });

  window.personaFlightsWidget = widget;
}

declare global {
  interface Window {
    personaFlightsWidget?: unknown;
  }
}
