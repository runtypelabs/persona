import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This example lives in a pnpm monorepo. Next 16's Turbopack otherwise infers
// the workspace root ambiguously (multiple lockfiles) and fails to resolve
// `next`; pin the root to the repo root so both the app and the workspace
// `@runtypelabs/persona` package sit inside the compilable root.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The repo enables pnpm's global virtual store, so node_modules symlinks into a
// store outside the repo (unless it is configured inside it, as on Vercel).
// Turbopack only follows symlinks inside its root, so add the store as an
// extra root. No-op when the store is in-repo or the GVS is off.
const nextPkg = realpathSync(createRequire(import.meta.url).resolve("next/package.json"));
const linksAt = nextPkg.indexOf(`${path.sep}links${path.sep}`);
const pnpmStore = linksAt === -1 ? null : nextPkg.slice(0, linksAt);
const turbopackAdditionalRoots =
  pnpmStore && !pnpmStore.startsWith(repoRoot + path.sep)
    ? { pnpmStore: { path: pnpmStore } }
    : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: repoRoot },
  experimental: { turbopackAdditionalRoots },
  // The widget ships ESM + its own CSS; transpile it so Next can consume the
  // workspace package (and its `@runtypelabs/persona/widget.css` subpath) directly.
  transpilePackages: ["@runtypelabs/persona"],
};

export default nextConfig;
