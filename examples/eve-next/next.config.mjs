import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repo enables pnpm's global virtual store, so node_modules symlinks into a
// store outside the repo (unless it is configured inside it, as on Vercel).
// Turbopack only follows symlinks inside its root, so add the store as an
// extra root. No-op when the store is in-repo or the GVS is off.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nextPkg = realpathSync(createRequire(import.meta.url).resolve("next/package.json"));
const linksAt = nextPkg.indexOf(`${path.sep}links${path.sep}`);
const pnpmStore = linksAt === -1 ? null : nextPkg.slice(0, linksAt);
const turbopackAdditionalRoots =
  pnpmStore && !pnpmStore.startsWith(repoRoot + path.sep)
    ? { pnpmStore: { path: pnpmStore } }
    : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["eve"],
  experimental: { turbopackAdditionalRoots },
};

// No agent server or credentials are needed to build and run Preview. Opt into
// withEve's integrated runtime only when using this project's live agent.
export default async function config(phase, context) {
  if (process.env.EVE_MODE === "live" && !process.env.EVE_BASE_URL) {
    const { withEve } = await import("eve/next");
    return withEve(nextConfig)(phase, context);
  }
  return nextConfig;
}
