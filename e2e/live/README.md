# Live GPT-Live harness (not CI)

This harness runs a real Chromium with a synthesized WAV as its microphone. The audio goes through real GPT-Live (OpenAI Live via Vercel AI Gateway), and the voice model delegates the turn to the widget's chat pipeline (client delegation). The spec checks the same flow as `e2e/specs/17-voice-gpt-live-delegation.spec.ts`. It saves `frames.json` (every voice frame in both directions, with audio recorded as byte counts), `console.txt`, `chat-requests.json`, `final.png` and a trace to `e2e/live/.out/results/<run id>/` (`LIVE_RUN_ID`, default a timestamp).

## Mode A: local host (no deployed core)

`gpt-live-host.mts` puts core's real `createOpenAILiveBrowserEngineHandler` behind `/ws/agents/:agentId/voice`, loaded from a core checkout. That gives you the VoiceCallEngine plus a GPT-Live session through the Vercel AI Gateway. The same host also serves a deterministic `/v1/client/*` chat agent: "opening hours" calls a `get_opening_hours` tool and returns Markdown. The host skips core's route-level admission: the database, client-token auth, the Flagship flag, and agent voice config.

```sh
# 1. A core checkout of the client-delegation branch, built
git -C ~/GitHub/core worktree add --detach /tmp/core-live origin/feat/gpt-live-client-delegation
cd /tmp/core-live && pnpm install --frozen-lockfile --ignore-scripts
./node_modules/.bin/turbo run build --filter=@runtypelabs/shared... --filter=@runtypelabs/runtime

# 2. The host (gateway key: AI_GATEWAY_API_KEY, else PLATFORM_VERCEL_GATEWAY_KEY from CORE_DEV_VARS)
CORE_DIR=/tmp/core-live CORE_DEV_VARS=~/GitHub/core/apps/api/.dev.vars \
  LIVE_CHAT_DELAY_MS=4000 /tmp/core-live/node_modules/.bin/tsx e2e/live/gpt-live-host.mts

# 3. Question audio + widget preview + run (from the persona repo root)
e2e/live/make-question-wav.sh "What are your opening hours?"
(cd apps/web && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --port 4391 --host 127.0.0.1 &)
E2E_PORT=4391 ./node_modules/.bin/playwright test --config e2e/live/playwright.live.config.ts
```

`LIVE_CHAT_DELAY_MS` mimics a real agent's latency. Without it, the answer comes back before GPT-Live speaks its filler line.

## Mode B: deployed core (full route admission)

Point the harness at a real core API with `LIVE_VOICE_HOST` and `LIVE_API_URL`, for example `wss://preview-pr-<N>-api.runtype-preview.com` and `https://preview-pr-<N>-api.runtype-preview.com` (the PR artifact on staging data). Then set `LIVE_CLIENT_TOKEN` and `LIVE_AGENT_ID`. Prerequisites:

- **Flag:** `enable-voice-openai-live` must be on for the caller. In development it is on by default. Anywhere else it falls back to off, and the socket answers HTTP 503 `VOICE_BROWSER_ENGINE_DISABLED`.
- **Agent:** a Runtype agent in the token's org with this voice config: `voice: { enabled: true, interruptionMode: "barge-in", speech: { mode: "speech_to_speech", transcriber: { provider: "openai", model: "gpt-live-1" }, synthesizer: { provider: "openai", model: "gpt-live-1", voiceId: "marin" } } }`. Give it a tool that answers the question.
- **Client token:** bound to that agent, with no `targetAlias` or `targetVersionId` (otherwise you get 422 `selector_unsupported_surface`). Its allowed origins must include `http://127.0.0.1:4391`. The widget must not send `sessionId` or a visitor token on the voice socket (otherwise you get 422 `VOICE_SHARED_SESSION_UNSUPPORTED`).
- **Credential:** an admitted Vercel AI Gateway credential, either the org's Vercel connection or the platform key fallback.
- **Answer pattern:** set `LIVE_ANSWER` to a regex that the agent's real answer matches.
