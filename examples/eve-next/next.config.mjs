import { withEve } from "eve/next";

/** @type {import('next').NextConfig} */
const nextConfig = {};

// `withEve()` launches the in-repo eve agent (./agent) on `next dev` and proxies
// same-origin `/eve/v1/...` requests to it, so there's no separate `eve dev`
// terminal and no EVE_HOST to set. In production it runs eve as a private
// service (on Vercel) or behind EVE_NEXT_PRODUCTION_ORIGIN. Requires Node >= 24.
export default withEve(nextConfig);
