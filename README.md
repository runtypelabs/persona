## 💻 Vanilla Agent ✨ A configurable agent widget in plain JS for websites
It's an AI chat SDK plus local demos and tooling. Flexible foundation to ship an always on custom assistant on a website.

Travrse is pre-integrated as the AI platform powering the agent, while the UI and proxy are written so that you can point them at any SSE-capable platform.

- `packages/widget` – the installable chat widget (`@runtypelabs/persona`).
- `packages/proxy` – the optional proxy server library (`@runtypelabs/persona-proxy`) for handling flow configuration using Travrse.
- `examples/embedded-app` – a Vite vanilla app showcasing runtime configuration (see `json.html` for the directive demo).
- `examples/vercel-edge` – Node.js proxy server for Vercel, Railway, Fly.io, and traditional servers.
- `examples/cloudflare-workers` – Edge proxy server optimized for Cloudflare Workers.

### Quick start

```bash
corepack enable
pnpm install
pnpm dev
```

The script starts the proxy on `http://localhost:43111` (auto-selects another free port if needed) and the embedded demo at `http://localhost:5173`. Both projects depend on the local widget package via workspace linking so changes hot-reload without publishing.

> **Note:** Make sure you are on Node `v20.19.0` (`nvm use`) before running `pnpm install`. Corepack is bundled with modern Node releases and manages pnpm for you.

See `packages/widget/README.md` for publishing details, configuration reference, and Travrse integration notes.

Install the widget library with `npm install @runtypelabs/persona`. For the proxy server, use `npm install @runtypelabs/persona-proxy`.

### Proxy Deployment Examples

The repository includes production-ready proxy examples for different deployment platforms. Both examples use shared flow configurations and utilities from the `@runtypelabs/persona-proxy` package to eliminate code duplication.

| Example | Best For | Deployment Platforms | Runtime | Docs |
|---------|----------|---------------------|---------|------|
| **[vercel-edge](./examples/vercel-edge)** | Quick start, Node.js environments | Vercel, Railway, Fly.io, Traditional servers | Node.js 20+ | [README](./examples/vercel-edge/README.md) |
| **[cloudflare-workers](./examples/cloudflare-workers)** | Edge computing, global scale | Cloudflare Workers | Edge runtime | [README](./examples/cloudflare-workers/README.md) |

**Choosing a deployment platform:**
- Use **vercel-edge** for: Quick deployment to Vercel, compatibility with Node.js hosting, easy local development
- Use **cloudflare-workers** for: Global edge deployment, low latency worldwide, serverless scaling

Both examples include:
- Secure API key handling (never exposed to browser)
- Multiple flow configurations (basic chat, directives, shopping assistant)
- Stripe checkout integration using REST API
- CORS support

### Publishing

This monorepo uses [Changesets](https://github.com/changesets/changesets) for version management and publishing.

**Creating a release:**

1. **Create a changeset** (after making changes):
   ```bash
   pnpm changeset
   ```
   Select which packages changed and the type of change (patch/minor/major). This creates a markdown file in `.changeset/` describing the change.

2. **Version packages**:
   ```bash
   pnpm changeset version
   ```
   This reads all changesets, updates package versions, generates changelogs, and removes used changesets.

3. **Build and publish**:
   ```bash
   pnpm release
   ```
   This builds both packages and publishes them to npm.

**Workflow:**
- Make changes → Create changeset → Commit → Version → Release
- You can accumulate multiple changesets before versioning
- Each package can be versioned independently
