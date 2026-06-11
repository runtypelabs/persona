import path from "node:path";
import { fileURLToPath } from "node:url";

// This example lives in a pnpm monorepo. Next 16's Turbopack otherwise infers
// the workspace root ambiguously (multiple lockfiles) and fails to resolve
// `next`; pin the root to the repo root so both the app and the workspace
// `@runtypelabs/persona` package sit inside the compilable root.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: repoRoot },
  // The widget ships ESM + its own CSS; transpile it so Next can consume the
  // workspace package (and its `@runtypelabs/persona/widget.css` subpath) directly.
  transpilePackages: ["@runtypelabs/persona"],
};

export default nextConfig;
