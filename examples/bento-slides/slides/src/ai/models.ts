// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The Copilot's brain: ONE hosted Runtype agent, reached straight from the
// browser with a publishable client token (origin-scoped, rate-limited; it
// can only talk to this agent). The model is pinned server-side — Qwen 3.8
// 27B runs the deck-editing turns, GPT-Live is the voice on the call — so
// nothing model-specific lives in the page.
//
// Two ways to point it elsewhere, neither of which changes the defaults:
//   - build time: VITE_RUNTYPE_API_URL / VITE_RUNTYPE_AGENT_ID /
//     VITE_RUNTYPE_CLIENT_TOKEN (your own agent and token);
//   - run time: `?runtype=staging` selects the staging test agent below. Only
//     named presets are accepted, so a link can never aim the page (and the
//     deck it reads) at an arbitrary host.

/// <reference types="vite/client" />

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

interface RuntypeTarget {
  apiUrl: string
  agentId: string
  clientToken: string
}

const PRESETS: Record<string, RuntypeTarget> = {
  /** "Bento Copilot (Voice · Qwen 3.8 27B)" in the Bento Copilot product. */
  production: {
    apiUrl: 'https://api.runtype.com',
    agentId: 'agent_01m49zzv5neakr5k3ma3qdpqrd',
    clientToken: 'ct_live_01m49zzv_8cee0746b6f9e5acfceceb1ec0713d87',
  },
  /** Staging test agent with voice direct tools on (see the README). */
  staging: {
    apiUrl: 'https://api.runtype-staging.com',
    agentId: 'agent_01m4mmq5xaepns7qz61mw62sjx',
    clientToken: 'ct_test_01m4mmq5_6d5c88819886086741fd1a8d7756c92f',
  },
}

const presetFromUrl = (): RuntypeTarget | undefined => {
  if (typeof location === 'undefined') return undefined
  const name = new URLSearchParams(location.search).get('runtype')
  return name && Object.hasOwn(PRESETS, name) ? PRESETS[name] : undefined
}

const target: RuntypeTarget = presetFromUrl() ?? {
  apiUrl: env.VITE_RUNTYPE_API_URL || PRESETS.production.apiUrl,
  agentId: env.VITE_RUNTYPE_AGENT_ID || PRESETS.production.agentId,
  clientToken: env.VITE_RUNTYPE_CLIENT_TOKEN || PRESETS.production.clientToken,
}

export const RUNTYPE_API_URL = target.apiUrl

export const COPILOT_AGENT_ID = target.agentId

/** Browser-safe client token bound to that agent (publishable by design). */
export const COPILOT_CLIENT_TOKEN = target.clientToken
