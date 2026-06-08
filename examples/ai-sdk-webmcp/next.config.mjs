/** @type {import('next').NextConfig} */
const nextConfig = {
  // The widget ships ESM + its own CSS; transpile it so Next can consume the
  // workspace package (and its `@runtypelabs/persona/widget.css` subpath) directly.
  transpilePackages: ["@runtypelabs/persona"],
  // This example has no ESLint config of its own; type-checking still runs.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
