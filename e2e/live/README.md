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
E2E_PORT=4391 CORE_DIR=/tmp/core-live CORE_DEV_VARS=~/GitHub/core/apps/api/.dev.vars \
  LIVE_CHAT_DELAY_MS=4000 /tmp/core-live/node_modules/.bin/tsx e2e/live/gpt-live-host.mts

# 3. Question audio + widget preview + run (from the persona repo root)
e2e/live/make-question-wav.sh "What are your opening hours?"
(cd apps/web && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --port 4391 --host 127.0.0.1 &)
E2E_PORT=4391 ./node_modules/.bin/playwright test --config e2e/live/playwright.live.config.ts
```

For a small-talk check, `e2e/live/make-question-wav.sh "Who are you?" e2e/live/.out/who.wav` and run with `LIVE_WAV=…/who.wav LIVE_QUESTION="who are you" LIVE_ANSWER="juniper|bakery" LIVE_EXPECT_SMALL_TALK=1` (expects no delegation). `LIVE_AGENT_IDENTITY=generic` drops the agent name/description/tools from the GPT-Live instructions (core's generic default), for measuring delegation on thin-identity agents. The host answers only the harness page origin (`http://127.0.0.1:$E2E_PORT`; set the same `E2E_PORT` for host and Playwright, or `LIVE_ALLOWED_ORIGINS`). `LIVE_CHAT_DELAY_MS` mimics a real agent's latency. Without it, the answer comes back before GPT-Live speaks its filler line. `LIVE_CHAT_STREAM_MS` streams the answer in sentence-sized `text_delta` chunks with that pause between them (default 0: one chunk), to show speech starting before the agent finishes (streaming delegation). `LIVE_CHAT_ANSWER` replaces the canned answer text.

## Mode B: deployed core (full route admission)

Point the harness at a real core API with `LIVE_VOICE_HOST` and `LIVE_API_URL`, for example `wss://preview-pr-<N>-api.runtype-preview.com` and `https://preview-pr-<N>-api.runtype-preview.com` (the PR artifact on staging data). Then set `LIVE_CLIENT_TOKEN` and `LIVE_AGENT_ID`. Prerequisites:

- **Flag:** `enable-voice-openai-live` must be on for the caller. In development it is on by default. Anywhere else it falls back to off, and the socket answers HTTP 503 `VOICE_BROWSER_ENGINE_DISABLED`.
- **Agent:** a Runtype agent in the token's org with this voice config: `voice: { enabled: true, interruptionMode: "barge-in", speech: { mode: "speech_to_speech", transcriber: { provider: "openai", model: "gpt-live-1" }, synthesizer: { provider: "openai", model: "gpt-live-1", voiceId: "marin" } } }`. Give it a tool that answers the question.
- **Client token:** bound to that agent, with no `targetAlias` or `targetVersionId` (otherwise you get 422 `selector_unsupported_surface`). Its allowed origins must include `http://127.0.0.1:4391`. The widget must not send `sessionId` or a visitor token on the voice socket (otherwise you get 422 `VOICE_SHARED_SESSION_UNSUPPORTED`).
- **Credential:** an admitted Vercel AI Gateway credential, either the org's Vercel connection or the platform key fallback.
- **Answer pattern:** set `LIVE_ANSWER` to a regex that the agent's real answer matches.
- **Widget build:** the preview must serve a widget built from this checkout (`./node_modules/.bin/vite build` in `apps/web`, after building `packages/widget`). A preview left running from an older build gives misleading results.

```sh
LIVE_VOICE_HOST=wss://api.runtype-staging.com LIVE_API_URL=https://api.runtype-staging.com \
  LIVE_CLIENT_TOKEN=… LIVE_AGENT_ID=… LIVE_ANSWER='8 ?am|Monday|9 ?am' \
  E2E_PORT=4391 ./node_modules/.bin/playwright test --config e2e/live/playwright.live.config.ts
```

The socket upgrade to deployed core is slow, about 3.4 s on staging compared with about 0.2 s against the local host. The widget starts capturing as soon as the microphone opens. It holds the audio captured during the upgrade (up to 8 s) and flushes it on open, and core queues those startup frames. That keeps the default WAV's 1.5 s lead-in sufficient. The spec times the socket in the page and fails early if the first mic frame trails the open by more than one capture buffer plus `LIVE_FIRST_AUDIO_SLACK_MS` (default 200 ms). That is the signature of audio lost during the upgrade, and the visitor's first words go with it. Each run's `frames.json` records the upgrade time and first-frame lag under `sockets`, and the test annotations show them too.

**Approvals.** Use an order WAV (`e2e/live/make-question-wav.sh "I'd like to order two almond croissants for pickup today at four p.m. My name is Nathan." e2e/live/.out/order.wav`) with `LIVE_WAV=…/order.wav LIVE_APPROVE=allow|deny LIVE_QUESTION=croissant`. The spec checks that `delegation_update` carries the approval script and does not claim the order is done. It then clicks Allow or Deny, and expects one terminal `delegation_result` after the `delegation_update{status:'pending_approval'}`: on Allow it is `completed` and must match `LIVE_FOLLOWUP`, which defaults to an order id like `JB-1234`; on Deny it is `denied`. It also expects `delegation_completed` with `final: false` then `final: true`, and folded read-backs. The agent needs `config.tools.approval`. Core's Client Chat (`/v1/client/chat`) must accept approval-gated agents: until it does, every chat turn for such an agent fails with 501 `APPROVAL_MODE_UNSUPPORTED`, and the spec says so.

**WebMCP approvals.** `LIVE_WEBMCP=1` makes the page register a gated `place_pickup_order` WebMCP page tool (`?webmcp=1` on `voice-e2e.html`), so the order parks on a WebMCP approval in the chat. That needs a client token bound to a surface whose allowed origins include the harness origin, plus an agent that calls the page tool. Example: `LIVE_WEBMCP=1 LIVE_WAV=…/order.wav LIVE_APPROVE=allow LIVE_QUESTION=croissant LIVE_TYPED=`. A run fails with the agent's answer when the agent asks for a spoken confirmation instead of calling the tool.

## Fast tier (direct route vs client path)

`fast-tier.live.spec.ts` measures the voice fast tier: core answering a trivial page-tool turn itself (`delegation_started{route:'direct'}`, `client_tool_call`, `client_tool_result`) instead of handing it to the chat pipeline. It is skipped unless `LIVE_FAST_TIER=1`, so the main spec's runs never include it. Run it against a deployed core in Mode B: a PR preview of the core fast-tier stack (`voice-opt/12-fast-tier-wire` + `voice-opt/13-fast-tier-router`) or staging once they are deployed there. **Never point it at production.** The local host in Mode A cannot run the router, because the router calls the decision model through core's model gateway.

Prerequisites, on top of Mode B's:

- **Agent:** the Mode B voice agent plus `voice.delegation.fastTier: { enabled: true }` (defaults: `model: "openai/gpt-6-luna-decisions"`, `tools.mode: "readOnly"`, `readout: "template"`, `timeoutMs: 5000`). Read-only mode only offers tools whose WebMCP annotation says `readOnlyHint: true`; the fixture's slide tools all do.
- **Client token:** bound to a surface whose WebMCP policy admits the harness origin, as for `LIVE_WEBMCP=1`.
- **Page:** the spec opens `voice-e2e.html?slides=1`, which registers a six-slide deck (`next_slide`, `jump_to_slide`, `get_slide`; slide 5 is Pricing) and enables WebMCP. The widget then declares `client_tools` and `delegation_routed` and sends the tool set right after `session_config`.

One WAV holds all three commands, with silences long enough for each turn to finish:

```sh
e2e/live/make-question-wav.sh "Next slide. [[slnc 12000]] Jump to the pricing slide. [[slnc 12000]] What's on slide three?" e2e/live/.out/slides.wav
LIVE_FAST_TIER=1 LIVE_WAV=e2e/live/.out/slides.wav \
  LIVE_VOICE_HOST=wss://preview-pr-<N>-api.runtype-preview.com LIVE_API_URL=https://preview-pr-<N>-api.runtype-preview.com \
  LIVE_CLIENT_TOKEN=… LIVE_AGENT_ID=… E2E_PORT=4391 \
  ./node_modules/.bin/playwright test --config e2e/live/playwright.live.config.ts e2e/live/fast-tier.live.spec.ts
```

The run writes `fast-tier.json` to the run's results directory and prints one annotation per heard utterance, plus the heard/spoken utterance count. For each utterance it records:

- **Speech end to first spoken audio.** Speech end is the user transcript's `endMs` mapped onto the page clock at `session_config` arrival, or the final transcript's arrival when core sends no `endMs`. First audio is the first binary audio frame after it, filler included.
- **Route.** The `delegation_started.route` values in order, for example `direct`, or `direct -> client` when core fell through.
- **Client tool call.** Whether a `client_tool_call` arrived, its tool and arguments, and the widget's `client_tool_result` status.
- **Readout.** The `delegation_completed` text and when its audio started.

`LIVE_UTTERANCES` overrides the expected commands (`|`-separated). `LIVE_EXPECT_DIRECT=1` fails the run unless every heard utterance got a `client_tool_call`. `LIVE_TURN_WAIT_MS` (default 15000) is the quiet time after the last utterance before hanging up. GPT-Live can split or merge spoken commands, so the heard count can differ from the spoken count; the spec reports both and fails only when it hears fewer than were spoken.
