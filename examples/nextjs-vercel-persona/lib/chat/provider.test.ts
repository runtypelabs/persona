import { describe, expect, it } from "vitest";

import {
  defaultPersonaModel,
  resolvePersonaBackend
} from "@/lib/chat/provider";

describe("resolvePersonaBackend", () => {
  it("prefers PERSONA_BACKEND over discovered credentials", () => {
    const result = resolvePersonaBackend({
      PERSONA_BACKEND: "runtype",
      RUNTYPE_API_KEY: "rt_key",
      AI_GATEWAY_API_KEY: "gw_key"
    });

    expect(result).toEqual({
      ok: true,
      backend: "runtype",
      model: defaultPersonaModel,
      source: "PERSONA_BACKEND"
    });
  });

  it("uses AI Gateway key before OIDC or Runtype during auto-detection", () => {
    const result = resolvePersonaBackend({
      AI_GATEWAY_API_KEY: "gw_key",
      VERCEL_OIDC_TOKEN: "oidc_token",
      RUNTYPE_API_KEY: "rt_key",
      PERSONA_MODEL: "anthropic/claude-sonnet-4.6"
    });

    expect(result).toEqual({
      ok: true,
      backend: "ai-gateway",
      model: "anthropic/claude-sonnet-4.6",
      source: "AI_GATEWAY_API_KEY"
    });
  });

  it("returns a configuration error when an override is missing required credentials", () => {
    const result = resolvePersonaBackend({
      PERSONA_BACKEND: "ai-gateway"
    });

    expect(result).toEqual({
      ok: false,
      error:
        "PERSONA_BACKEND=ai-gateway requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN."
    });
  });
});
