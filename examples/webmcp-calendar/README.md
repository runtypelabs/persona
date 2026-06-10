# WebMCP Calendar Copilot

A calendar dashboard where the embedded Persona widget and external AI clients
(e.g. [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp/))
call the **same ten WebMCP tools** — no DOM scraping or screenshots. It
demonstrates a hybrid "AI-native dashboard": traditional mouse-and-keyboard
controls and a conversational front door, side by side.

## What it shows

- **WebMCP tools as the shared contract** — `calendar.js` registers ten tools
  on `document.modelContext` (create/update/delete events, availability
  search, state reads). Persona calls them via `webmcp.enabled`; Chrome
  DevTools MCP calls the very same functions.
- **Hybrid UX** — a Quick Add form for manual workflows plus a prompt bar
  ("Ask your calendar copilot…"). Submitting the prompt slides Persona out as
  a full-height docked copilot and collapses the manual input surfaces;
  closing restores them.
- **Friendly tool approvals** — read-only tools auto-approve
  (`webmcp.autoApprove`); mutating tools show approval bubbles with
  human-friendly copy via tool `title`s and `approval.formatDescription`,
  with technical details collapsed behind "Show details".
- **Two embedding styles** — the default docked side panel, or append
  [`?mode=pill`](http://localhost:5173/?mode=pill) to mount Persona as its
  native bottom composer-bar pill instead.
- **Timezone-safe tool design** — tool inputs and outputs use local
  wall-clock times (`YYYY-MM-DDTHH:mm`, no UTC offsets), so "8am" always
  lands at 8am on the visible calendar.

## Run it

From the repo root:

```bash
pnpm install
cd examples/webmcp-calendar
cp .env.example .env.local   # fill VITE_PERSONA_CLIENT_TOKEN
pnpm dev
```

Open `http://localhost:5173`, type a request into the prompt bar (or press
Enter on the empty bar to run the canned demo prompt), and approve the tool
call when the copilot asks.

To drive the same tools from Chrome DevTools MCP instead, follow the setup in
the [original quickstart's README](https://github.com/WebMCP-org/chrome-devtools-quickstart#2-add-mcp-server-to-your-ai-client).

## Attribution

This example is adapted from
[**WebMCP-org/chrome-devtools-quickstart**](https://github.com/WebMCP-org/chrome-devtools-quickstart)
by the [WebMCP](https://github.com/MiguelsPizza/WebMCP) team, which pairs a
Vite app with `@mcp-b/global` to expose page tools to Chrome DevTools MCP.
The original code is © its contributors and licensed under the
[MIT License](https://github.com/WebMCP-org/chrome-devtools-quickstart/blob/main/LICENSE);
the calendar dashboard, Persona integration, and copilot UX were built on top
of that foundation.
