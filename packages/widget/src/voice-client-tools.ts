/**
 * Subpath/chunk module for the voice fast tier
 * (`@runtypelabs/persona/voice-client-tools` → `dist/voice-client-tools.{js,cjs}`).
 *
 * `client.ts` loads this on demand via `voice-client-tools-loader.ts` when a
 * Runtype voice call negotiates `client_tools` (the IIFE from a sibling URL,
 * ESM/CJS via this external subpath), so calls without it never download it.
 */
export { createVoiceClientToolsSession, voiceClientToolName } from "./voice/voice-client-tools-session";
