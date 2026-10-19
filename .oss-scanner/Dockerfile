# Build image for Anthropic's OSS Scanner (github.com/anthropics/oss-scanner).
# pnpm 12 (corepack) monorepo; mirrors .github/workflows/ci.yml. Only the two
# published packages (widget + proxy) and their deps are installed: apps/ and
# examples/ are demos and out of scope (see threat_model.md).
FROM node:24-bookworm
# tsdown builds ~20 entries in parallel and exceeds the default V8 heap.
ENV CI=true \
    NODE_OPTIONS=--max-old-space-size=6144

RUN corepack enable

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src

RUN corepack install \
    && pnpm install --frozen-lockfile \
      --filter @runtypelabs/persona... \
      --filter @runtypelabs/persona-proxy...
RUN pnpm build

# Smoke-test the image; failures are logged, not fatal.
RUN pnpm --filter @runtypelabs/persona test:run || echo "WARNING: widget tests reported failures"
RUN pnpm --filter @runtypelabs/persona-proxy test:run || echo "WARNING: proxy tests reported failures"
