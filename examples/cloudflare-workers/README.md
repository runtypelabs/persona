# Persona Proxy - Cloudflare Workers

A production-ready chat proxy service deployed on Cloudflare Workers, powered by the `@runtypelabs/persona-proxy` package and Runtype AI.

## Features

- **Multiple Proxy Endpoints**: Three different configurations demonstrating various use cases
- **Custom API Endpoints**: Example form handler and health check
- **Shared Package Imports**: Uses `@runtypelabs/persona-proxy` from the monorepo
- **Edge Deployment**: Runs on Cloudflare's global network for low latency
- **Type Safety**: Full TypeScript support with Cloudflare Workers types

## Available Endpoints

### Proxy Endpoints

1. **`/api/chat/dispatch`** - Basic conversational assistant
   - Simple proxy with default settings
   - Great for getting started

2. **`/api/chat/dispatch-directive`** - Directive-enabled flow
   - Uses a reference to an existing Runtype flow (via `RUNTYPE_FLOW_ID`)
   - Demonstrates flow ID configuration

3. **`/api/chat/dispatch-action`** - Shopping assistant with JSON actions
   - Inline flow configuration that returns JSON actions for page interaction
   - Supports actions: `message`, `nav_then_click`, `message_and_click`, `checkout`
   - Designed for e-commerce applications with DOM interaction capabilities

### Custom Endpoints

- **`POST /api/checkout`** - Stripe checkout session creation (requires `STRIPE_SECRET_KEY`)
- **`POST /api/form`** - Form submission handler
- **`GET /health`** - Health check and status
- **`GET /`** - API documentation and available endpoints

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and pnpm installed
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally or use via pnpm
- Runtype API key ([get one here](https://runtype.com))

## Setup

### 1. Install Dependencies

From the root of the monorepo:

```bash
pnpm install
```

### 2. Configure Environment Variables

Create a `.dev.vars` file for local development:

```bash
cd examples/cloudflare-proxy
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your Runtype API key and optionally other configuration:

```env
RUNTYPE_API_KEY=rt_test_your_api_key_here
RUNTYPE_FLOW_ID=flow_your_flow_id_here  # Optional, for directive flow
STRIPE_SECRET_KEY=sk_test_your_stripe_key_here  # Optional, for checkout functionality
ALLOWED_ORIGINS=*  # Optional, defaults to "*". For production, use: https://yourdomain.com
```

**Environment Variables:**
- `RUNTYPE_API_KEY` (required): Your Runtype API key
- `RUNTYPE_FLOW_ID` (optional): Reference to an existing Runtype flow for the directive endpoint
- `STRIPE_SECRET_KEY` (optional): Stripe secret key for checkout functionality
- `ALLOWED_ORIGINS` (optional): CORS allowed origins. Defaults to `*` (all origins). For production, set to your frontend domain(s). Supports comma-separated list: `https://app.com,https://www.app.com`

### 3. Authenticate with Cloudflare

```bash
npx wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

## Local Development

Start the development server:

```bash
pnpm dev
```

Or from the monorepo root:

```bash
pnpm dev:cloudflare-proxy
```

The proxy will be available at `http://localhost:8787`.

### Test the Endpoints

```bash
# Health check
curl http://localhost:8787/health

# Test basic proxy (requires a chat client or POST request)
curl -X POST http://localhost:8787/api/chat/dispatch \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'

# Test form submission
curl -X POST http://localhost:8787/api/form \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

## Deployment

### 1. Set Production Secrets

Before deploying, set your API key as a secret:

```bash
npx wrangler secret put RUNTYPE_API_KEY
```

Optionally, set your flow ID:

```bash
npx wrangler secret put RUNTYPE_FLOW_ID
```

Optionally, set your Stripe secret key (required for checkout functionality):

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

**Important for Production - Set ALLOWED_ORIGINS:**

For security, configure allowed CORS origins:

```bash
npx wrangler secret put ALLOWED_ORIGINS
# When prompted, enter: https://yourdomain.com
# Or for multiple origins: https://yourdomain.com,https://www.yourdomain.com
```

You'll be prompted to enter the value. This keeps sensitive data out of your code.

### 2. Deploy to Cloudflare Workers

```bash
pnpm deploy
```

Or:

```bash
npx wrangler deploy
```

After deployment, you'll see output like:

```
Published @runtypelabs/persona-proxy (1.2.3)
  https://@runtypelabs/persona-proxy.your-subdomain.workers.dev
```

### 3. Verify CORS Configuration

The worker uses the `ALLOWED_ORIGINS` environment variable for CORS configuration.

**Development** (`.dev.vars`):
```env
ALLOWED_ORIGINS=*
```

**Production** (via wrangler secret):
```bash
npx wrangler secret put ALLOWED_ORIGINS
# Enter: https://yourdomain.com,https://www.yourdomain.com
```

The worker will automatically parse the comma-separated list. No code changes required!

## Configuration

### Customize Worker Name

Edit `wrangler.toml`:

```toml
name = "your-custom-name"
```

### Update Allowed Origins

CORS origins are now configured via the `ALLOWED_ORIGINS` environment variable:

- **Local Development**: Edit `.dev.vars` and set `ALLOWED_ORIGINS=*`
- **Production**: Use `npx wrangler secret put ALLOWED_ORIGINS` and enter your domain(s)
- **Multiple Origins**: Use comma-separated list: `https://app.com,https://www.app.com`
- **Wildcard**: Use `*` to allow all origins (not recommended for production)

### Add Custom Domains

In `wrangler.toml`:

```toml
routes = [
  { pattern = "api.yourdomain.com/*", custom_domain = true }
]
```

See [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) for details.

## Usage with Frontend

### Vanilla JavaScript

```javascript
const response = await fetch('https://your-worker.workers.dev/api/chat/dispatch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});

const data = await response.json();
console.log(data);
```

### With Persona Widget

```javascript
import { VanillaAgent } from '@runtypelabs/persona';

const agent = new VanillaAgent({
  dispatchUrl: 'https://your-worker.workers.dev/api/chat/dispatch'
});

agent.mount('#chat-container');
```

## Shopping Assistant Flow

The `/api/chat/dispatch-action` endpoint provides a shopping assistant that returns JSON actions for page interaction. This is designed for e-commerce applications where the assistant needs to interact with the page DOM.

### Action Types

The shopping assistant responds with JSON in one of these formats:

**1. Simple message:**
```json
{
  "action": "message",
  "text": "Your response text here"
}
```

**2. Navigate then show message:**
```json
{
  "action": "nav_then_click",
  "page": "http://site.com/page-url",
  "on_load_text": "Message to show after navigation"
}
```

**3. Show message and click an element:**
```json
{
  "action": "message_and_click",
  "element": ".className-of-element",
  "text": "Your message text"
}
```

**4. Create Stripe checkout:**
```json
{
  "action": "checkout",
  "text": "Your message text",
  "items": [
    {"name": "Product Name", "price": 2999, "quantity": 1}
  ]
}
```

### Frontend Integration

To use the shopping assistant, your frontend needs to:

1. **Send page context** - Include DOM elements (class names and text) in the request
2. **Parse JSON responses** - Extract the action and execute it
3. **Handle navigation** - Store state when navigating between pages

See `examples/embedded-app/src/action-middleware-demo.ts` and `examples/embedded-app/src/middleware.ts` for a complete implementation.

### Example Conversation Flow

```
User: "I am looking for a black shirt in medium"
Assistant: {"action": "message", "text": "Here are the products..."}

User: "Add it to my cart"
Assistant: {"action": "message_and_click", "element": ".AddToCartButton-black-shirt-medium", "text": "Added to cart!"}

User: "Checkout"
Assistant: {"action": "checkout", "text": "Creating checkout...", "items": [{"name": "Black Shirt", "price": 2999, "quantity": 1}]}
```

## Architecture

This example demonstrates:

- **Shared Package Usage**: Imports `createChatProxyApp` from the workspace `@runtypelabs/persona-proxy` package
- **Multiple Configurations**: Shows different ways to configure the proxy (basic, flow ID reference, inline flow config)
- **E-commerce Integration**: Shopping assistant with JSON action responses for DOM interaction
- **Stripe Payments**: Direct integration with Stripe Checkout API for payment processing
- **Custom Endpoints**: Extends the proxy with additional API endpoints (checkout, form submission)
- **Type Safety**: Full TypeScript support with Cloudflare Workers types
- **Independent Deployment**: Can be deployed without affecting other parts of the monorepo

## Monitoring

View logs in real-time:

```bash
npx wrangler tail
```

Or view in the [Cloudflare Dashboard](https://dash.cloudflare.com/) under Workers & Pages > your-worker > Logs.

## Troubleshooting

### Error: "Missing RUNTYPE_API_KEY"

Make sure you've set the secret:

```bash
npx wrangler secret put RUNTYPE_API_KEY
```

### CORS Errors

Update the `ALLOWED_ORIGINS` environment variable to include your frontend domain:

**Local Development:**
Edit `.dev.vars` and add:
```env
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

**Production:**
```bash
npx wrangler secret put ALLOWED_ORIGINS
# Enter: https://yourdomain.com
```

### TypeScript Errors

Run type checking:

```bash
pnpm types-check
```

## Learn More

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Runtype AI Docs](https://docs.runtype.com)
- [Hono Framework](https://hono.dev/)

## License

This example is part of the persona monorepo. See the root LICENSE file for details.
