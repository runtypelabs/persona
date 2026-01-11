## Vercel Edge Proxy Example

A production-ready chat proxy server that securely forwards requests to Travrse AI. Built with Hono and optimized for Vercel, but also works on other Node.js platforms like Railway, Fly.io, and traditional servers.

This example uses shared flow configurations and utilities from the `@runtypelabs/persona-proxy` package, making it easy to maintain and extend.

## Features

- **Secure API key handling** - Never exposes your Travrse API key to the browser
- **Multiple flow configurations**:
  - Basic conversational assistant
  - Directive-enabled flow (via flow ID)
  - Shopping assistant with JSON actions
- **Stripe checkout integration** - Uses Stripe REST API (no SDK required)
- **CORS support** - Configurable allowed origins
- **Auto port selection** - Automatically finds available port for local development

## Local Development

### Prerequisites

- Node.js 20+ (or use the version specified in `.nvmrc` if present)
- pnpm (or npm/yarn)

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env` file in this directory:
```bash
TRAVRSE_API_KEY=tv_test_xxx
TRAVRSE_FLOW_ID=flow_xxx  # Optional, for directive-enabled flow
STRIPE_SECRET_KEY=sk_test_xxx  # Optional, for checkout functionality
FRONTEND_URL=http://localhost:5173  # Optional, defaults to http://localhost:5173
```

3. Start the development server:
```bash
pnpm dev
```

The server will start on port `43111` (or next available port) and automatically reload on file changes.

## Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/dispatch` | POST | Basic conversational assistant (default flow) |
| `/api/chat/dispatch-directive` | POST | Directive-enabled flow (requires `TRAVRSE_FLOW_ID`) |
| `/api/chat/dispatch-action` | POST | Shopping assistant with JSON actions (message, nav_then_click, message_and_click, checkout) |
| `/api/checkout` | POST | Stripe checkout session creation (requires `STRIPE_SECRET_KEY`) |
| `/form` | POST | Form submission handler for directive demo |

## Deploying to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Set environment variables in Vercel dashboard:
   - `TRAVRSE_API_KEY` (required)
   - `TRAVRSE_FLOW_ID` (optional)
   - `STRIPE_SECRET_KEY` (optional)
   - `FRONTEND_URL` (optional)

### Option 2: Deploy via Git Integration

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the project in Vercel dashboard
3. Set the root directory to `examples/vercel-edge`
4. Configure environment variables
5. Deploy

### Environment Variables

Set these in the Vercel dashboard (Settings → Environment Variables):

- **TRAVRSE_API_KEY** (required): Your Travrse API key
- **TRAVRSE_FLOW_ID** (optional): Flow ID for directive-enabled endpoint
- **STRIPE_SECRET_KEY** (optional): Stripe secret key for checkout functionality
- **FRONTEND_URL** (optional): Your frontend URL for checkout redirect URLs

## Deploying to Other Platforms

This example works on any Node.js hosting platform:

### Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Run `railway init`
3. Set environment variables: `railway variables set TRAVRSE_API_KEY=xxx`
4. Deploy: `railway up`

### Fly.io

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Run `fly launch`
3. Set secrets: `fly secrets set TRAVRSE_API_KEY=xxx`
4. Deploy: `fly deploy`

### Traditional Node.js Server

1. Build the project:
```bash
pnpm build
```

2. Set environment variables on your server

3. Start the server:
```bash
node dist/server.js
```

Or use a process manager like PM2:
```bash
pm2 start dist/server.js --name chat-proxy
```

## Shared Code

This example uses shared flow configurations and utilities from `@runtypelabs/persona-proxy`:

- **Flow configs**: `SHOPPING_ASSISTANT_FLOW` from `@runtypelabs/persona-proxy/flows`
- **Stripe helpers**: `createCheckoutSession` from `@runtypelabs/persona-proxy/utils`

This eliminates code duplication across deployment examples and makes maintenance easier.

## Comparison with Other Examples

| Example | Best For | Deployment | Dependencies |
|---------|----------|------------|--------------|
| **vercel-edge** (this) | Quick start, Node.js platforms | Vercel, Railway, Fly.io | Node.js runtime |
| **cloudflare-workers** | Edge computing, global scale | Cloudflare Workers | None (edge runtime) |

For production edge deployment with global low latency, see the [`cloudflare-workers`](../cloudflare-workers) example.
