import { fileURLToPath } from "node:url";
import { flue } from "@flue/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [flue()],
  server: { host: "127.0.0.1", port: 3301 },
});
