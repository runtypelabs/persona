## Embedded App Demo

This Vite (vanilla JS) app showcases the streaming chat widget running both inline and as a floating launcher. It consumes the library via the workspace link so live edits in `packages/widget` hot-reload here.

### Scripts

```bash
pnpm install
pnpm dev --filter proxy           # start backend proxy (prefers port 43111)
pnpm dev --filter embedded-app
```

Or from the repo root:

```bash
pnpm dev
```

- Proxy starts on `http://localhost:43111` (or the next free port) and forwards requests to your chat backend (Runtype adapter is bundled by default) once you set the appropriate secrets.
- If you override the proxy port, export `VITE_PROXY_PORT` (and optionally `VITE_PROXY_URL`) so the frontend points at the right target.
- Vite serves the demo UI on `http://localhost:5173`.

Tweak `src/main.ts` to experiment with different configuration presets, launcher styles, or metadata payloads. The demo now exposes buttons (`Open Launcher`, `Toggle Launcher`) wired up via the controller returned from `initAgentWidget`.

## Examples

### Basic Demo
- **Main page**: `http://localhost:5173` or `http://localhost:5173/index.html`
  - Shows inline widget and launcher widget examples
  - Basic chat functionality

### Dynamic Forms Demo
- **Dynamic Forms page**: `http://localhost:5173/dynamic-form.html`
  - Demonstrates AI-generated dynamic forms using the component middleware
  - The AI generates form definitions with custom fields, and the `DynamicForm` component renders them
  - Forms are fully themeable via `config.formStyles`
  - Submitted data is POSTed to the configured `formEndpoint` (default: `/form`)

The dynamic forms example demonstrates:
- Component registry with `DynamicForm` for rendering AI-generated forms
- JSON streaming with `parserType: "json"` and `enableComponentStreaming: true`
- Dynamic field generation based on conversation context
- Theme integration via `config.theme` and `config.formStyles`

#### Setting Up Dynamic Forms

```typescript
import { componentRegistry } from "@runtypelabs/persona";
import { DynamicForm } from "./components";

// Register the DynamicForm component
componentRegistry.register("DynamicForm", DynamicForm);

initAgentWidget({
  target: "#app",
  config: {
    apiUrl: "/api/chat/dispatch-directive",
    parserType: "json",
    enableComponentStreaming: true,
    formEndpoint: "/form",
    formStyles: {
      borderRadius: "16px",
      borderWidth: "2px",
      borderColor: "#e5e7eb",
      padding: "1.5rem"
    }
  }
});
```

#### AI Response Format for Forms

The AI should respond with JSON in this format:

```json
{
  "text": "Please fill out this form:",
  "component": "DynamicForm",
  "props": {
    "title": "Schedule a Demo",
    "description": "Share your details and we'll follow up.",
    "fields": [
      { "label": "Full Name", "type": "text", "required": true },
      { "label": "Email", "type": "email", "required": true },
      { "label": "Company", "type": "text" },
      { "label": "Preferred Date", "type": "date", "required": true },
      { "label": "Notes", "type": "textarea", "placeholder": "Any topics to cover?" }
    ],
    "submit_text": "Request Demo"
  }
}
```

#### Supported Field Types

- `text` - Standard text input
- `email` - Email input with validation
- `tel` - Phone number input
- `date` - Date picker
- `time` - Time picker
- `textarea` - Multi-line text
- `number` - Numeric input

> **Deprecation Notice:** The old `<Form type="init"/>` directive approach using `directivePostprocessor` is deprecated. It only supported predefined form templates ("init" and "followup"). The new `DynamicForm` component approach is recommended as it allows the AI to generate contextually appropriate forms with any fields.

### Action Middleware / E-commerce Demo
- **E-commerce page**: `http://localhost:5173/action-middleware.html`
  - Demonstrates chat middleware that interacts with the page DOM
  - Collects DOM elements (classnames + innerText) and sends them to the LLM as context
  - Parses JSON action responses and executes actions (message, navigation, clicking elements)
  - Includes chat history persistence via localStorage
  - **Product detail page**: `http://localhost:5173/products.html` (for navigation demo)

The action middleware example demonstrates:
- DOM context collection for LLM decision-making
- JSON action parsing (`message`, `nav_then_click`, `message_and_click`)
- Automatic element clicking based on LLM responses
- Page navigation with persistent chat state
- localStorage-based chat history persistence

### WebMCP Demo
- **WebMCP page**: `http://localhost:5173/webmcp-demo.html`
  - Demonstrates the widget consuming **page-provided tools** via WebMCP (`document.modelContext`)
  - The page registers five storefront tools (`search_products`, `view_product`, `add_to_cart`, `remove_from_cart`, `apply_promo`) on the polyfilled `document.modelContext` (`@mcp-b/webmcp-polyfill`); the widget snapshots them per turn and sends them to the agent as `clientTools[]`
  - When the agent calls one, the widget executes it on the page (behind an `onConfirm` gate for writes) and resumes the turn with the result
  - The catalog (`webmcp-catalog.ts`), selected-product state, and on-page **Cart** panel are the visible side effects: `search_products` filters the static catalog, `view_product` focuses details, and cart/promo tools update the cart

#### What the starter pills show

1. **Single read** — *"Search for blue running shoes"* → one `search_products` call (read-only, auto-approved by the demo's `autoApprove` policy, no bubble).
2. **Single write** — *"Add SHOE-001 to my cart"* → one `add_to_cart` call gated by the native approval bubble; on Approve the cart updates.
3. **Continuation** — *"Find the cheapest blue running shoe and add it to my cart"* → the agent searches, then runs a **second turn** to add the cheapest hit, proving the agent loop continues after a tool result.
4. **Parallel** — *"Add SHOE-001 and SHOE-007 to my cart"* → the model emits **two** `add_to_cart` calls in a single turn. Each renders its own native approval bubble; approve both and the widget batches their results into a **single** `/resume`, so both items land in the cart and the agent summarizes the total.

> **Parallel local tool calls (fixed).** Asking to add two items "at the same time" makes the model emit *parallel* local tool calls in one turn. The server emits a `step_await` for each carrying a distinct per-call `toolCallId` (**runtypelabs/core#3878**, follow-on to #3870). The widget collects all pending local calls for one `executionId` and posts **one** `/resume` whose `toolOutputs` are keyed by `toolCallId` (`session.ts → resolveWebMcpToolCallBatch`) — previously it posted one `/resume` per tool keyed by **tool name**, so two calls to the same tool collided on that key and the turn hung on the second. Single-call and distinct-tool turns are unchanged (name-keying remains the fallback for servers that don't emit `toolCallId`).
>
> **Note on resume routing.** In proxy mode the widget posts the local-tool `/resume` to `…/api/chat/dispatch-webmcp/resume`, and the proxy forwards it upstream to `/v1/dispatch/resume` with its surface API key (`packages/proxy/src/index.ts`).

### WebMCP Calendar Copilot
- **Calendar page**: `http://localhost:5173/webmcp-calendar.html` (proxy mode — agent defined in code as `WEBMCP_CALENDAR_FLOW`, mounted at `/api/chat/dispatch-calendar`)
  - A hybrid "AI-native dashboard": a calendar with a manual **Quick Add** form *and* a conversational prompt bar; both drive the same state the WebMCP tools expose
  - `src/webmcp-calendar/calendar.js` registers **seven tools** on `document.modelContext` via `@mcp-b/global` (calendar/event reads, availability search, date selection, create/update/delete events) — callable by the embedded Persona widget *and* by [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp/) against the same page. Static lookup data such as users and event colors is intentionally baked into schemas/context instead of exposed as lookup-only tools.
  - Submitting the prompt bar slides Persona out as a **full-height docked copilot** and collapses the manual input surfaces; closing restores them. Append `?mode=pill` to mount the native composer-bar pill instead
  - Read-only tools auto-approve (`webmcp.autoApprove`); mutating tools show approval bubbles with friendly copy via tool `title`s + `approval.formatDescription`
  - Tool inputs/outputs use **local wall-clock times** (no UTC offsets) so "8am" lands at 8am on the visible calendar
  - Adapted from [WebMCP-org/chrome-devtools-quickstart](https://github.com/WebMCP-org/chrome-devtools-quickstart) (MIT) by the WebMCP team — the Vite + `@mcp-b/global` foundation is theirs; the calendar dashboard, Persona integration, and copilot UX are built on top

#### Wiring — same pattern as the other demos

Like the bakery and storefront demos, the WebMCP demos run entirely through the **local proxy** — there is no client token and no hosted Runtype agent. Each agent is defined **in code** (`WEBMCP_STOREFRONT_FLOW`, `WEBMCP_CALENDAR_FLOW`, `WEBMCP_SLIDES_FLOW`) and mounted by the proxy server (`examples/vercel-edge/src/server.ts`) at its matching route (`/api/chat/dispatch-webmcp`, `/api/chat/dispatch-calendar`, `/api/chat/dispatch-slides`). The page code simply points `apiUrl` at that route.

How the page tools reach the agent: the page registers its tools on `document.modelContext`; the widget snapshots them every turn and sends them on the dispatch payload as `clientTools[]`; the proxy forwards `clientTools[]` upstream, where the Runtype runtime threads them into the flow's prompt step. When the model calls one, the widget executes it on the page and posts the result back via `/resume`. The agent definition, system prompt, and model (`claude-sonnet-4-6`, chosen because WebMCP needs reliable **native** tool calls) all live in the repo.

`pnpm dev` starts this proxy automatically (port 43111). The page log at the top of each WebMCP demo prints the resolved backend, e.g. `mode: proxy → http://localhost:43111/api/chat/dispatch-webmcp`.

To run against your own Runtype flow instead of the in-code definitions, set the matching `FLOW_ID_*` override on the proxy (`FLOW_ID_WEBMCP`, `FLOW_ID_CALENDAR`, or `FLOW_ID_SLIDES` in `examples/vercel-edge/src/server.ts`).

> **Note on parallel local tool calls.** "Add SHOE-001 and SHOE-007 at the same time" makes the model emit *parallel* local tool calls in one turn, which depends on **runtypelabs/core#3878** / **#3870** being deployed upstream; single-tool turns work regardless.

### WebMCP Slide-Deck Editor (Deck Copilot)
- **Slides page**: `http://localhost:5173/webmcp-slides.html` (proxy mode — agent defined in code as `WEBMCP_SLIDES_FLOW`, mounted at `/api/chat/dispatch-slides`)
  - A Keynote-lite editor (960×540 canvas, slide sorter, themes, presenter mode) where the human and the Persona agent **co-edit the same live canvas** — the richest WebMCP surface in the repo (roughly twenty tools vs. the calendar's seven)
  - `src/webmcp-slides/tools.ts` registers the tools on `document.modelContext`, and the tool set is **dynamic** — the demo's headline trick:
    - `style_selection` / `align_selection` exist only while the user has **2+ elements selected** (AbortController re-registration, debounced)
    - `enter_presenter_mode` **replaces the entire editing set** with show controls (`next_slide`, `prev_slide`, `jump_to_slide`, `exit_presenter_mode`) until the show ends
  - **Selection as context**: a `contextProviders` + `requestMiddleware` pair ships the live editor state (current slide, mode, selected element ids + bounds) as `{{slides_context}}` with every message — so *"align these"* works without the user describing anything
  - **Shared undo stack**: agent tools and human gestures commit through the same store, so ⌘Z undoes the agent's edits too
  - Approval policy by blast radius: reads *and* incremental writes auto-approve (watch the agent assemble a slide live, with an outline pulse on everything it touches); only destructive/deck-wide tools (`delete_slide`, `delete_elements`, `apply_theme`) raise the native approval bubble with friendly copy
  - Theme tokens (`theme.accent`, `theme.heading`, …) resolve at render time, which is what makes `apply_theme` restyle the whole deck in one call
  - Try: *"What's in this deck?"* → *"Add a slide about pricing with three tiers"* → drag a box out of place, shift-select two others, *"align these and match their styles"* → *"Apply the Midnight theme"* (approval) → ⌘Z → *"Present the deck"*

### WebMCP Paint (Paint Pal)
- **Paint page**: `http://localhost:5173/webmcp-paint.html` (proxy mode — agent defined in code as `WEBMCP_PAINT_FLOW`, mounted at `/api/chat/dispatch-paint`)
  - A real, **unmodified jspaint** (the MS Paint remake) embedded same-origin, driven by the Persona agent through operator-level WebMCP tools: `select_tool`, `set_colors`, `draw_stroke` (replayed as pointer events, so strokes animate live and land on jspaint's real undo stack), `flood_fill`, `undo`, `clear_canvas` (approval-gated), and `get_canvas_snapshot`
  - **The headline trick is the visual loop**: `get_canvas_snapshot` returns the canvas as an MCP **image content block** through `/resume`, so the agent can look at what it painted and fix it — the only demo in the repo with a multimodal observe-act loop (the Theme Copilot's `screenshot_preview` pioneered the transport)
  - jspaint ships as a pinned **git dependency** (`runtypelabs/jspaint` fork) served at `/jspaint/` by the `serveJsPaint` Vite plugin — nothing is vendored into this repo. Same-origin serving is load-bearing: `src/webmcp-paint/jspaint-host.ts` injects `public/jspaint-bridge.mjs` into the iframe (re-injected on every load — jspaint replaces its document during session bootstrap), which imports jspaint's own ES modules and reaches its lexical-global app state, something the iframe's CSP forbids doing via eval or inline scripts
  - The widget wears a config-only **Windows 98 theme**: navy title bar, silver chrome, square corners, Tahoma, tooltip-yellow approvals, and Win95 bevels faked with inset box-shadows on the shadow tokens
  - Try: *"Draw a house with a sun in the sky"* → *"Look at the canvas and tell me what you see"* (watch it critique and fix its own drawing) → *"Clear the canvas"* (approval)

### Custom Components Demo
- **Components page**: `http://localhost:5173/custom-components.html`
  - Demonstrates custom component rendering from JSON directives
  - Components are registered and can be invoked via JSON responses with the format: `{"component": "ComponentName", "props": {...}}`
  - Props update incrementally as they stream in from the AI
  - Includes example components: ProductCard, SimpleChart, StatusBadge, InfoCard

The custom components example demonstrates:
- Component registry for registering custom renderers
- JSON streaming parser that extracts component directives
- Incremental prop updates during streaming
- Type-safe component renderer interface

#### Registering Components

```typescript
import { componentRegistry } from "@runtypelabs/persona";
import { ProductCard } from "./components";

// Register via global registry
componentRegistry.register("ProductCard", ProductCard);
```

Or register via config:

```typescript
initAgentWidget({
  target: "#app",
  config: {
    components: {
      ProductCard,
      SimpleChart,
      StatusBadge,
      InfoCard
    },
    parserType: "json", // Required for component directives
    enableComponentStreaming: true // Enable streaming updates
  }
});
```

#### Component Renderer Signature

```typescript
type ComponentRenderer = (
  props: Record<string, unknown>,
  context: {
    message: AgentWidgetMessage;
    config: AgentWidgetConfig;
    updateProps: (newProps: Record<string, unknown>) => void;
  }
) => HTMLElement;
```

#### JSON Response Format

The AI should respond with JSON in this format:

```json
{
  "component": "ProductCard",
  "props": {
    "title": "Amazing Product",
    "price": 29.99,
    "image": "https://example.com/image.jpg",
    "description": "This is a great product!"
  }
}
```

For combined text + component responses:

```json
{
  "text": "Here's your product:",
  "component": "ProductCard",
  "props": { "title": "Laptop", "price": 999 }
}
```

#### Try It Out

Ask the AI to:
- "Show me a product card for a laptop priced at $999"
- "Display a chart with sales data: [100, 150, 200, 180, 250]"
- "Create a success status badge"
- "Show an info card with a warning message"
