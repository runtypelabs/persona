export type PersonaBackend = "ai-gateway" | "runtype";

export type ResolvedPersonaBackend =
  | {
      ok: true;
      backend: PersonaBackend;
      model: string;
      source:
        | "PERSONA_BACKEND"
        | "AI_GATEWAY_API_KEY"
        | "VERCEL_OIDC_TOKEN"
        | "RUNTYPE_API_KEY";
    }
  | {
      ok: false;
      error: string;
    };

export const defaultPersonaModel = "openai/gpt-5.4";

type EnvSource = Record<string, string | undefined>;

function normalizeBackendName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ai-gateway" || normalized === "gateway") {
    return "ai-gateway" as const;
  }
  if (normalized === "runtype") {
    return "runtype" as const;
  }
  return null;
}

export function resolvePersonaBackend(env: EnvSource): ResolvedPersonaBackend {
  const configuredModel = env.PERSONA_MODEL?.trim() || defaultPersonaModel;

  if (env.PERSONA_BACKEND) {
    const backend = normalizeBackendName(env.PERSONA_BACKEND);
    if (!backend) {
      return {
        ok: false,
        error:
          "Invalid PERSONA_BACKEND. Use \"ai-gateway\" or \"runtype\"."
      };
    }

    if (
      backend === "ai-gateway" &&
      !env.AI_GATEWAY_API_KEY &&
      !env.VERCEL_OIDC_TOKEN
    ) {
      return {
        ok: false,
        error:
          "PERSONA_BACKEND=ai-gateway requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN."
      };
    }

    if (backend === "runtype" && !env.RUNTYPE_API_KEY) {
      return {
        ok: false,
        error: "PERSONA_BACKEND=runtype requires RUNTYPE_API_KEY."
      };
    }

    return {
      ok: true,
      backend,
      model: configuredModel,
      source: "PERSONA_BACKEND"
    };
  }

  if (env.AI_GATEWAY_API_KEY) {
    return {
      ok: true,
      backend: "ai-gateway",
      model: configuredModel,
      source: "AI_GATEWAY_API_KEY"
    };
  }

  if (env.VERCEL_OIDC_TOKEN) {
    return {
      ok: true,
      backend: "ai-gateway",
      model: configuredModel,
      source: "VERCEL_OIDC_TOKEN"
    };
  }

  if (env.RUNTYPE_API_KEY) {
    return {
      ok: true,
      backend: "runtype",
      model: configuredModel,
      source: "RUNTYPE_API_KEY"
    };
  }

  return {
    ok: false,
    error:
      "No backend credentials found. Set PERSONA_BACKEND, AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, or RUNTYPE_API_KEY."
  };
}

export function getPersonaBackendLabel(result: ResolvedPersonaBackend) {
  if (!result.ok) {
    return "Setup required";
  }
  return result.backend === "ai-gateway" ? "Vercel AI Gateway" : "Runtype";
}
