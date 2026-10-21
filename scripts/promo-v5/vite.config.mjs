import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const widget = path.resolve(here, "../../packages/widget/src");

// Plain object: this folder has no node_modules of its own, so it borrows the
// widget package's Vite binary and resolves Persona from source like apps/web.
export default {
  root: here,
  server: { port: 5199, strictPort: true, fs: { allow: [path.resolve(here, "../..")] } },
  resolve: {
    alias: {
      "@runtypelabs/persona/testing": path.resolve(widget, "testing"),
      "@runtypelabs/persona/widget.css": path.resolve(widget, "styles/widget.css"),
      "@runtypelabs/persona": widget,
    },
  },
};
