import { defineConfig, type Plugin, type HtmlTagDescriptor } from "vite";
import path from "node:path";
import fs from "node:fs";

const proxyPort = Number(process.env.PROXY_PORT ?? 43111);
const PREVIEW_EMBED_CHECK_TIMEOUT_MS = 5000;

type PreviewEmbedCheckVerdict = "allowed" | "blocked" | "unknown";

function getRequestOrigin(req: { headers: { host?: string; origin?: string } }): string {
  if (req.headers.origin) return req.headers.origin;
  return `http://${req.headers.host ?? "localhost:5173"}`;
}

function extractFrameAncestorsDirective(cspHeader: string | null): string[] | null {
  if (!cspHeader) return null;

  const directive = cspHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => /^frame-ancestors(\s|$)/i.test(part));

  if (!directive) return null;
  return directive.replace(/^frame-ancestors\s*/i, "").split(/\s+/).filter(Boolean);
}

function hostMatchesPattern(hostname: string, pattern: string): boolean {
  if (!pattern.startsWith("*.")) return hostname === pattern;
  const suffix = pattern.slice(2);
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function matchesFrameAncestorsSource(
  embedderOrigin: string,
  framedOrigin: string,
  source: string
): boolean {
  const normalizedSource = source.trim();
  if (!normalizedSource) return false;
  if (normalizedSource === "*") return true;
  if (normalizedSource === "'none'") return false;
  if (normalizedSource === "'self'") return embedderOrigin === framedOrigin;
  if (/^[a-z][a-z0-9+.-]*:$/i.test(normalizedSource)) {
    return new URL(embedderOrigin).protocol === normalizedSource;
  }

  try {
    const embedderUrl = new URL(embedderOrigin);
    const sourceUrl = new URL(normalizedSource.replace("://*.", "://placeholder."));

    if (sourceUrl.protocol !== embedderUrl.protocol) return false;
    if (sourceUrl.port && sourceUrl.port !== embedderUrl.port) return false;

    const sourceHost = normalizedSource.includes("://*.")
      ? normalizedSource.split("://")[1] ?? ""
      : sourceUrl.hostname;

    return hostMatchesPattern(embedderUrl.hostname, sourceHost);
  } catch {
    return false;
  }
}

function isBlockedByFrameAncestors(
  cspHeader: string | null,
  embedderOrigin: string,
  framedOrigin: string
): boolean {
  const sources = extractFrameAncestorsDirective(cspHeader);
  if (!sources || sources.length === 0) return false;
  return !sources.some((source) => matchesFrameAncestorsSource(embedderOrigin, framedOrigin, source));
}

function isBlockedByXFrameOptions(
  xFrameOptions: string | null,
  embedderOrigin: string,
  framedOrigin: string
): boolean {
  if (!xFrameOptions) return false;

  const normalized = xFrameOptions.trim().toLowerCase();
  if (normalized === "deny") return true;
  if (normalized === "sameorigin") return embedderOrigin !== framedOrigin;
  if (normalized.startsWith("allow-from ")) {
    const allowedOrigin = normalized.slice("allow-from ".length).trim();
    return allowedOrigin !== embedderOrigin.toLowerCase();
  }
  return false;
}

async function checkPreviewEmbeddable(
  rawUrl: string,
  embedderOrigin: string
): Promise<{ verdict: PreviewEmbedCheckVerdict; reason: string }> {
  const targetUrl = new URL(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_EMBED_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    await response.body?.cancel().catch(() => {});

    const framedOrigin = new URL(response.url || targetUrl.toString()).origin;
    const cspHeader = response.headers.get("content-security-policy");
    if (isBlockedByFrameAncestors(cspHeader, embedderOrigin, framedOrigin)) {
      return { verdict: "blocked", reason: "csp-frame-ancestors" };
    }

    const xFrameOptions = response.headers.get("x-frame-options");
    if (isBlockedByXFrameOptions(xFrameOptions, embedderOrigin, framedOrigin)) {
      return { verdict: "blocked", reason: "x-frame-options" };
    }

    return { verdict: "allowed", reason: "allowed" };
  } catch {
    return { verdict: "unknown", reason: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
}

function registerPreviewEmbedCheckMiddleware(
  middlewares: {
    use: (path: string, handler: (req: any, res: any, next: () => void) => void | Promise<void>) => void;
  }
): void {
  middlewares.use("/api/preview/embed-check", async (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }

    try {
      const requestUrl = new URL(req.url ?? "", "http://localhost");
      const rawTarget = requestUrl.searchParams.get("url");
      if (!rawTarget) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ verdict: "unknown", reason: "missing-url" }));
        return;
      }

      const targetUrl = new URL(rawTarget);
      if (!/^https?:$/i.test(targetUrl.protocol)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ verdict: "unknown", reason: "invalid-protocol" }));
        return;
      }

      const result = await checkPreviewEmbeddable(rawTarget, getRequestOrigin(req));
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ verdict: "unknown", reason: "invalid-url" }));
    }
  });
}

// Serve the widget's built dist files at /widget-dist/ so standalone examples
// can load the local IIFE build instead of the CDN version during development.
// During production builds, copies the files into the output directory.
function serveWidgetDist(): Plugin {
  const distDir = path.resolve(__dirname, "../../packages/widget/dist");
  const filesToCopy = ["widget.css", "index.global.js", "index.global.js.map"];

  return {
    name: "serve-widget-dist",
    configureServer(server) {
      server.middlewares.use("/widget-dist", (req, res, next) => {
        const filePath = path.join(distDir, req.url ?? "");
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const contentType =
            ext === ".js" ? "application/javascript" :
            ext === ".css" ? "text/css" :
            ext === ".map" ? "application/json" :
            "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/widget-dist", (req, res, next) => {
        const filePath = path.join(distDir, req.url ?? "");
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const contentType =
            ext === ".js" ? "application/javascript" :
            ext === ".css" ? "text/css" :
            ext === ".map" ? "application/json" :
            "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dirname, "dist");
      const targetDir = path.join(outDir, "widget-dist");
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      for (const file of filesToCopy) {
        const src = path.join(distDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(targetDir, file));
        }
      }
    },
  };
}

function llmsTxt(): Plugin {
  const llmsTxtPath = path.resolve(__dirname, "llms.txt");
  const widgetDir = path.resolve(__dirname, "../../packages/widget");
  // Order matters: README first (overview), then the split reference docs,
  // then the theme/token reference. Keep in sync with packages/widget/docs/.
  const widgetDocPaths = [
    "README.md",
    "docs/PROGRAMMATIC-CONTROL.md",
    "docs/UI-COMPONENTS.md",
    "docs/INSTALLATION-FRAMEWORKS.md",
    "docs/CONFIGURATION-REFERENCE.md",
    "docs/STREAM-PARSERS.md",
    "THEME-CONFIG.md",
  ].map((p) => path.resolve(widgetDir, p));

  function buildLlmsTxt(): string {
    return fs.readFileSync(llmsTxtPath, "utf-8");
  }

  function buildLlmsFullTxt(): string {
    const overview = fs.readFileSync(llmsTxtPath, "utf-8");
    const widgetDocs = widgetDocPaths.map((p) => fs.readFileSync(p, "utf-8"));
    return [
      overview.replace(
        /^(> Full reference .*)$/m,
        "> This is the full reference. For the overview only, see https://persona-chat.dev/llms.txt"
      ),
      "",
      "---",
      "",
      "# Widget Configuration Reference",
      "",
      "The sections below are the complete widget documentation (initialization, programmatic control, UI components, config tables, parsers, proxy setup, framework guides) and the theme/token reference.",
      "",
      widgetDocs.join("\n\n---\n\n"),
    ].join("\n");
  }

  function serveMiddleware(middlewares: {
    use: (path: string, handler: (req: any, res: any) => void) => void;
  }): void {
    middlewares.use("/llms.txt", (_req, res) => {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(buildLlmsTxt());
    });
    middlewares.use("/llms-full.txt", (_req, res) => {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(buildLlmsFullTxt());
    });
  }

  return {
    name: "llms-txt",
    configureServer(server) {
      serveMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      serveMiddleware(server.middlewares);
    },
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dirname, "dist");
      fs.writeFileSync(path.join(outDir, "llms.txt"), buildLlmsTxt());
      fs.writeFileSync(path.join(outDir, "llms-full.txt"), buildLlmsFullTxt());
    },
  };
}

function previewEmbedCheck(): Plugin {
  return {
    name: "preview-embed-check",
    configureServer(server) {
      registerPreviewEmbedCheckMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      registerPreviewEmbedCheckMiddleware(server.middlewares);
    },
  };
}

// Font sets used by the shared stylesheets. Kept in sync with the families each
// CSS file expects: demo-shared.css (gallery/demo pages) and index.css (home,
// theme, products).
const GALLERY_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Asap+Condensed:wght@400;600&family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=JetBrains+Mono:wght@400;500;600&display=swap";

const HOME_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Asap+Condensed:wght@400&family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=JetBrains+Mono:wght@400;700&display=swap";

// Load the gallery fonts via <link> in <head> rather than an `@import` inside the
// CSS. The browser only discovers an `@import` *after* the stylesheet downloads —
// a serialized request with no preconnect — which delayed the web fonts enough to
// show a visible font-swap flash (FOUT) on first paint. Injecting preconnect +
// the stylesheet into <head> lets the fonts download in parallel and arrive far
// sooner. Pages that ship their own fonts (bakery, standalone) are left alone.
function galleryFonts(): Plugin {
  return {
    name: "gallery-fonts",
    transformIndexHtml(html) {
      const href = html.includes("demo-shared.css")
        ? GALLERY_FONTS_HREF
        : html.includes("src/index.css")
          ? HOME_FONTS_HREF
          : null;
      if (!href) return;
      const tags: HtmlTagDescriptor[] = [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
          injectTo: "head-prepend",
        },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true },
          injectTo: "head-prepend",
        },
        {
          tag: "link",
          attrs: { rel: "stylesheet", href },
          injectTo: "head-prepend",
        },
      ];
      return tags;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serveWidgetDist(), llmsTxt(), previewEmbedCheck(), galleryFonts()],
  resolve: {
    alias: {
      "@runtypelabs/persona/theme-editor": path.resolve(
        __dirname,
        "../../packages/widget/src/theme-editor"
      ),
      "@runtypelabs/persona/testing": path.resolve(
        __dirname,
        "../../packages/widget/src/testing"
      ),
      "@runtypelabs/persona/plugin-kit": path.resolve(
        __dirname,
        "../../packages/widget/src/plugin-kit"
      ),
      "@runtypelabs/persona/widget.css": path.resolve(
        __dirname,
        "../../packages/widget/src/styles/widget.css"
      ),
      "@runtypelabs/persona": path.resolve(
        __dirname,
        "../../packages/widget/src"
      ),
    }
  },
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries({
        main: path.resolve(__dirname, 'index.html'),
        advanced: path.resolve(__dirname, 'advanced.html'),
        'action-middleware': path.resolve(__dirname, 'action-middleware.html'),
        'dynamic-form': path.resolve(__dirname, 'dynamic-form.html'),
        'dynamic-form-fields': path.resolve(__dirname, 'dynamic-form-fields.html'),
        theme: path.resolve(__dirname, 'theme.html'),
        products: path.resolve(__dirname, 'products.html'),
        'custom-components': path.resolve(__dirname, 'custom-components.html'),
        'feedback-integration-demo': path.resolve(__dirname, 'feedback-integration-demo.html'),
        'client-token-demo': path.resolve(__dirname, 'client-token-demo.html'),
        'client-token-feedback-demo': path.resolve(__dirname, 'client-token-feedback-demo.html'),
        'docked-panel-demo': path.resolve(__dirname, 'docked-panel-demo.html'),
        'persistent-composer': path.resolve(__dirname, 'persistent-composer.html'),
        // Agent demo
        'agent-demo': path.resolve(__dirname, 'agent-demo.html'),
        // WebMCP — page-discovered tools
        'webmcp-demo': path.resolve(__dirname, 'webmcp-demo.html'),
        // WebMCP — calendar copilot (client-token mode)
        'webmcp-calendar': path.resolve(__dirname, 'webmcp-calendar.html'),
        // Bakery demo pages
        'bakery': path.resolve(__dirname, 'bakery.html'),
        'bakery-story': path.resolve(__dirname, 'bakery-story.html'),
        'bakery-locations': path.resolve(__dirname, 'bakery-locations.html'),
        'bakery-goods': path.resolve(__dirname, 'bakery-goods.html'),
        'bakery-services': path.resolve(__dirname, 'bakery-services.html'),
        // Approval demo
        'attachments-demo': path.resolve(__dirname, 'attachments-demo.html'),
        'approval-demo': path.resolve(__dirname, 'approval-demo.html'),
        // Focus input demo
        'focus-input-demo': path.resolve(__dirname, 'focus-input-demo.html'),
        // Optional smart-dom-reader page-context provider (shadow DOM / iframes)
        'smart-dom-reader-demo': path.resolve(__dirname, 'smart-dom-reader-demo.html'),
        'event-stream-testing': path.resolve(__dirname, 'event-stream-testing.html'),
        'artifact-demo': path.resolve(__dirname, 'artifact-demo.html'),
        'fullscreen-assistant-demo': path.resolve(__dirname, 'fullscreen-assistant-demo.html'),
        'launcher-demo': path.resolve(__dirname, 'launcher-demo.html'),
        'custom-loading-indicator': path.resolve(__dirname, 'custom-loading-indicator.html'),
        'tool-loading-demo': path.resolve(__dirname, 'tool-loading-demo.html'),
        'stream-animations-demo': path.resolve(__dirname, 'stream-animations-demo.html'),
        'ask-user-question-demo': path.resolve(__dirname, 'ask-user-question-demo.html'),
        'voice-integration-demo': path.resolve(__dirname, 'voice-integration-demo.html'),
        'autoscroll-stress-test': path.resolve(__dirname, 'autoscroll-stress-test.html'),
        // Standalone (CDN / Copy-Paste) pages
        'standalone/shopify': path.resolve(__dirname, 'standalone/shopify.html'),
        'standalone/example-shop': path.resolve(__dirname, 'standalone/example-shop.html'),
        'standalone/example-shop-metadata': path.resolve(__dirname, 'standalone/example-shop-metadata.html'),
        'standalone/example-shop-installer': path.resolve(__dirname, 'standalone/example-shop-installer.html'),
        'standalone/example-shop-installer-voice-metadata': path.resolve(__dirname, 'standalone/example-shop-installer-voice-metadata.html'),
        'standalone/sample': path.resolve(__dirname, 'standalone/sample.html'),
        'standalone/preview-mode': path.resolve(__dirname, 'standalone/preview-mode.html'),
        'standalone/lifecycle-events': path.resolve(__dirname, 'standalone/lifecycle-events.html'),
      }).filter(([, entryPath]) => fs.existsSync(entryPath))
      )
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api/chat/dispatch": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-action": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-component": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-bakery": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-storefront": `http://localhost:${proxyPort}`,
      "/api/checkout": `http://localhost:${proxyPort}`,
      "/form": `http://localhost:${proxyPort}`
    }
  }
});
