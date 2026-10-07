// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// The Copilot's brain: ONE hosted Runtype agent, reached straight from the
// browser with a publishable client token (origin-scoped, rate-limited; it
// can only talk to this agent). The model is pinned server-side — Qwen 3.8
// 27B runs the deck-editing turns, GPT-Live is the voice on the call — so
// nothing model-specific lives in the page.
//
// Override at build time with VITE_RUNTYPE_API_URL / VITE_RUNTYPE_AGENT_ID /
// VITE_RUNTYPE_CLIENT_TOKEN (a staging agent, your own token).

/// <reference types="vite/client" />

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

export const RUNTYPE_API_URL = env.VITE_RUNTYPE_API_URL || 'https://api.runtype.com'

/** "Bento Copilot (Voice · Qwen 3.8 27B)" in the Bento Copilot product. */
export const COPILOT_AGENT_ID = env.VITE_RUNTYPE_AGENT_ID || 'agent_01m49zzv5neakr5k3ma3qdpqrd'

/** Browser-safe client token bound to that agent (publishable by design). */
export const COPILOT_CLIENT_TOKEN =
  env.VITE_RUNTYPE_CLIENT_TOKEN || 'ct_live_01m49zzv_8cee0746b6f9e5acfceceb1ec0713d87'
