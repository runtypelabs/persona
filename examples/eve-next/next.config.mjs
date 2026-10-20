/** @type {import('next').NextConfig} */
const nextConfig = { serverExternalPackages: ["eve"] };

// No agent server or credentials are needed to build and run Preview. Opt into
// withEve's integrated runtime only when using this project's live agent.
export default async function config(phase, context) {
  if (process.env.EVE_MODE === "live" && !process.env.EVE_BASE_URL) {
    const { withEve } = await import("eve/next");
    return withEve(nextConfig)(phase, context);
  }
  return nextConfig;
}
