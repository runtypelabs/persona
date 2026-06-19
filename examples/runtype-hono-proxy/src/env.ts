/** Env bag shared by Node (`process.env`), Vercel, and Workers bindings. */
export type ProxyEnv = Record<string, string | undefined>;

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:4173"];

/** Parse ALLOWED_ORIGINS: `"*"` wildcard or comma-separated list; localhost defaults when unset. */
export function parseAllowedOrigins(env: ProxyEnv): string[] {
  const raw = env.ALLOWED_ORIGINS;
  if (raw === "*") return ["*"];
  return raw ? raw.split(",").map((o) => o.trim()) : DEFAULT_ORIGINS;
}

export function resolveCorsOrigin(
  requestOrigin: string | undefined,
  allowedOrigins: string[],
): string {
  if (requestOrigin && allowedOrigins.includes("*")) return requestOrigin;
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin;
  return allowedOrigins[0] ?? DEFAULT_ORIGINS[0]!;
}

export function frontendBaseUrl(env: ProxyEnv): string {
  return env.FRONTEND_URL || "http://localhost:5173";
}
