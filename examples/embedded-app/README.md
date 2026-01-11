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

- Proxy starts on `http://localhost:43111` (or the next free port) and forwards requests to your chat backend (Travrse adapter is bundled by default) once you set the appropriate secrets.
- If you override the proxy port, export `VITE_PROXY_PORT` (and optionally `VITE_PROXY_URL`) so the frontend points at the right target.
- Vite serves the demo UI on `http://localhost:5173`.

Tweak `src/main.ts` to experiment with different configuration presets, launcher styles, or metadata payloads. The demo now exposes buttons (`Open Launcher`, `Toggle Launcher`) wired up via the controller returned from `initAgentWidget`.

## Examples

### Basic Demo
- **Main page**: `http://localhost:5173` or `http://localhost:5173/index.html`
  - Shows inline widget and launcher widget examples
  - Basic chat functionality

### Dynamic Forms Demo
- **Dynamic Forms page**: `http://localhost:5173/json.html`
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
