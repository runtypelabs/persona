import { defineConfig } from "vite";
import path from "node:path";

const proxyPort = Number(process.env.PROXY_PORT ?? 43111);

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      "@runtypelabs/persona": path.resolve(
        __dirname,
        "../../packages/widget/src"
      ),
      "@runtypelabs/persona/widget.css": path.resolve(
        __dirname,
        "../../packages/widget/src/styles/widget.css"
      )
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'action-middleware': path.resolve(__dirname, 'action-middleware.html'),
        json: path.resolve(__dirname, 'json.html'),
        theme: path.resolve(__dirname, 'theme.html'),
        products: path.resolve(__dirname, 'products.html'),
        'custom-components': path.resolve(__dirname, 'custom-components.html'),
        'feedback-demo': path.resolve(__dirname, 'feedback-demo.html'),
        'feedback-integration-demo': path.resolve(__dirname, 'feedback-integration-demo.html'),
        'client-token-demo': path.resolve(__dirname, 'client-token-demo.html'),
        'client-token-feedback-demo': path.resolve(__dirname, 'client-token-feedback-demo.html'),
        'navigation-persist-demo': path.resolve(__dirname, 'navigation-persist-demo.html'),
        'navigation-persist-page2': path.resolve(__dirname, 'navigation-persist-page2.html'),
        'preview-mode-demo': path.resolve(__dirname, 'preview-mode-demo.html'),
        // Agent demo
        'agent-demo': path.resolve(__dirname, 'agent-demo.html'),
        // Bakery demo pages
        'bakery': path.resolve(__dirname, 'bakery.html'),
        'bakery-story': path.resolve(__dirname, 'bakery-story.html'),
        'bakery-locations': path.resolve(__dirname, 'bakery-locations.html'),
        'bakery-goods': path.resolve(__dirname, 'bakery-goods.html'),
        'bakery-services': path.resolve(__dirname, 'bakery-services.html'),
        // Approval demo
        'approval-demo': path.resolve(__dirname, 'approval-demo.html'),
        // Focus input demo
        'focus-input-demo': path.resolve(__dirname, 'focus-input-demo.html'),
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api/chat/dispatch": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-action": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-component": `http://localhost:${proxyPort}`,
      "/api/chat/dispatch-bakery": `http://localhost:${proxyPort}`,
      "/api/checkout": `http://localhost:${proxyPort}`,
      "/form": `http://localhost:${proxyPort}`
    }
  }
});
