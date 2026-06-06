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
  - The page registers `search_products` and `add_to_cart` on the polyfilled `document.modelContext` (`@mcp-b/webmcp-polyfill`); the widget snapshots them per turn and sends them to the agent as `clientTools[]`
  - When the agent calls one, the widget executes it on the page (behind an `onConfirm` gate) and resumes the turn with the result
  - The catalog (`webmcp-catalog.ts`) and the on-page **Cart** panel are the visible side effects: `search_products` filters the static catalog; `add_to_cart` updates the cart

#### What the starter pills show

1. **Single read** — *"Search for blue running shoes"* → one `search_products` call (read-only, auto-approved by the demo's `autoApprove` policy, no bubble).
2. **Single write** — *"Add SHOE-001 to my cart"* → one `add_to_cart` call gated by the native approval bubble; on Approve the cart updates.
3. **Continuation** — *"Find the cheapest blue running shoe and add it to my cart"* → the agent searches, then runs a **second turn** to add the cheapest hit, proving the agent loop continues after a tool result.
4. **Parallel** — *"Add SHOE-001 and SHOE-007 to my cart"* → the model emits **two** `add_to_cart` calls in a single turn. Each renders its own native approval bubble; approve both and the widget batches their results into a **single** `/resume`, so both items land in the cart and the agent summarizes the total.

> **Parallel local tool calls (fixed).** Asking to add two items "at the same time" makes the model emit *parallel* local tool calls in one turn. The server emits a `step_await` for each carrying a distinct per-call `toolCallId` (**runtypelabs/core#3878**, follow-on to #3870). The widget collects all pending local calls for one `executionId` and posts **one** `/resume` whose `toolOutputs` are keyed by `toolCallId` (`session.ts → resolveWebMcpToolCallBatch`) — previously it posted one `/resume` per tool keyed by **tool name**, so two calls to the same tool collided on that key and the turn hung on the second. Single-call and distinct-tool turns are unchanged (name-keying remains the fallback for servers that don't emit `toolCallId`).
>
> **Note on resume routing.** The local-tool `/resume` round-trip only completes in **proxy mode** (`pnpm dev` runs the local proxy, which holds the surface API key and forwards to `/v1/dispatch/resume`). The client-token API surface (`/v1/client/*`) has no resume route, so client-token mode can register and dispatch WebMCP tools but cannot resume a paused local-tool execution — tracked as **runtypelabs/core#3889** (add a session-authenticated `POST /v1/client/resume`). Use proxy mode to exercise the round-trip end to end until that lands.

#### Two wiring modes

`webmcp-demo.ts` selects its backend from env, reading a **distinct** pair of vars (note the `VITE_PERSONA_` prefix — not the `VITE_CLIENT_TOKEN` / `VITE_API_URL` used by the other demos):

1. **Client-token mode** — set `VITE_PERSONA_CLIENT_TOKEN` (and optionally `VITE_PERSONA_API_URL`, default `https://api.runtype.com`). The widget talks to the Runtype API directly. The token's surface must have `behavior.webmcp.enabled`. This is the mode the live `persona-chat.dev` deploy uses.
2. **Proxy mode** (fallback when no client token is set) — routes through the local proxy on `VITE_PROXY_PORT`.

Locally, put the token in `.env.local` (gitignored — **never commit a live token**):

```bash
# examples/embedded-app/.env.local
VITE_PERSONA_CLIENT_TOKEN=ct_live_...
VITE_PERSONA_API_URL=https://api.runtype.com
```

The page log at the top of the demo prints the resolved mode, e.g. `mode: client-token → https://api.runtype.com`.

#### Production deploy (persona-chat.dev on Vercel)

The live demo runs in client-token mode against production Runtype. The token is a browser-safe, origin-locked **publishable** client token — but it still belongs in Vercel env, not the repo. Set it on the `persona` Vercel project (Production scope):

```bash
vercel env add VITE_PERSONA_CLIENT_TOKEN production   # paste the ct_live_... value when prompted
vercel env add VITE_PERSONA_API_URL production        # https://api.runtype.com
vercel --prod                                          # redeploy to pick up the new env
```

After redeploy, confirm the page log shows `mode: client-token → https://api.runtype.com` (not `mode: proxy → …`), then run a single-tool prompt (`search for blue running shoes`) and confirm `search_products` fires on the page (confirm gate → execute → resume → summary).

> **Status (blocked):** Production Runtype core must ship the `clientTools[]`-threading fix before this works end-to-end. Until then, prod agents hallucinate the tool call as text instead of emitting a native tool call (no `step_await`), regardless of model — verified against both `minimax-m2.7` and `claude-sonnet-4-6`, while the identical setup on staging produces a real `step_await`. Keep the Vercel wiring above ready, but don't expect tool execution on prod until the core deploy lands. Chained "search **and** add" prompts additionally depend on `runtypelabs/core#3870` (parallel local tool calls); single-tool turns work once core is deployed.

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
