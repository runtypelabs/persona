import agents from "agents/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [agents(), cloudflare()] });
