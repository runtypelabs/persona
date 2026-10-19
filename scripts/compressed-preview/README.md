# Compressed widget preview

Run from the repository root after building the widget:

```sh
pnpm build:widget
pnpm preview:compressed
```

Open http://localhost:5204/. The server binds only to loopback. It precompresses
the built JavaScript and CSS with Brotli quality 11 and gzip level 9 before
listening, then serves the encoding accepted by the browser. No compilation or
compression work happens during timed requests. The page uses the deferred
installer, V5 defaults, and a local mocked reply endpoint. No API key is needed.

The page records launcher click → `onChatReady`, lifecycle events, compression,
and encoded/decoded resource sizes. For cold runs, clear the browser cache once, leave
DevTools Disable cache **unchecked**, then reload with network throttling.
This lets prefetches be reused within the visit. Reload again for a warm run. Normal installer prefetch remains enabled; waiting
before clicking can improve the result. Close the widget to see the whole table.

The server holds a snapshot in memory. Restart it after rebuilding, then clear
the browser cache before testing the new snapshot.

## Repeatable browser measurements

With the server running:

```sh
node scripts/compressed-preview/measure.mjs
```

This runs three fresh Chromium contexts per profile: unthrottled local,
10 Mbps with 40 ms emulated latency, and 1 Mbps with 100 ms latency. Each context starts with an empty cache, but caching stays
enabled for within-visit prefetch reuse. CPU is unthrottled, and the launcher is clicked as soon as available.
Every widget response must have `Content-Encoding: br`; resource timing must
report compressed core bytes. One run also sends a message through the mock.
JSON results, screenshots, and videos go to `/tmp/persona-compressed-preview`.
Screen recording adds some overhead; these are local lab measurements.

Options:

- `PERSONA_DIST_DIR`: alternate built dist directory for the server.
- `PERSONA_PREVIEW_PORT`: server port (default 5204).
- `PERSONA_PREVIEW_URL`: benchmark URL (default `http://localhost:5204/`).
- `PERSONA_PREVIEW_RUNS`: repetitions per profile (default 3).
- `PERSONA_PREVIEW_RESULTS`: output directory for benchmark artifacts.

To compare builds, serve each saved dist with the same harness and run the same
profiles, saving results in separate directories. Compare median click-to-ready
times. A current-build timing alone does **not** measure added readiness latency.
These timings include core and required chunks, request waterfalls, parsing, and
rendering; they are not the transfer time of just the renderer chunks.

## Full-screen and other assistants

`http://localhost:5204/fullscreen` mounts the same built widget without a launcher,
so navigation-to-composer can be measured separately from launcher opening.
Both fixtures show loading feedback only after 300ms. To see it, use a fresh
cache with network throttling; the complete widget still appears in one reveal.

`node scripts/compressed-preview/measure-assistants.mjs` measures three fresh
contexts per network profile for the publicly accessible Gemini and Perplexity
composers and the local Persona full-screen fixture. It confirms unsent test
text survives two animation frames, clears it, and saves screenshots, videos,
and JSON under `/tmp/persona-assistant-bench/controlled` (override with
`PERSONA_ASSISTANT_RESULTS`). It does not submit prompts.

The October 2026 access probe encountered security verification at ChatGPT and
Claude and a sign-in page at Copilot in fresh automated contexts. Do not count
these as composer timings or try to bypass them. Signed-in warm reloads require
a separate existing-browser measurement and must be labeled separately from
these signed-out, controlled cold tests. The local Persona fixture excludes
production authentication, account loading, and remote server overhead.

## Grouped activity preview

Open http://localhost:5204/activity to compare adjacent and iteration groups using
the built widget. **Run all** streams a reasoning trace and five mocked tool calls over three iterations,
with pauses between batches. Run again to check that historical groups stay done.

Shared detail panel presets customize fill, border color/width, radius, and
padding live. Tool and reasoning pickers offer partial overrides to check
per-property inheritance: choose shared bordered, then tool green fill and
reasoning borderless. Switching presets clears previous values; Reset panel
theme restores the subtle defaults. These controls restyle current mock and
live-agent history without sending a new request. Choose reasoning Row + Panel
to compare both surfaces; plain/inset reasoning and outer cards stay independent.

Single-tool iterations render directly. The switches
exercise custom summaries and group-only icon visibility; expand a
group to check its child rows. The animation selector applies the same style to
waiting labels, individual tools, and group headers, and can be changed mid-run.
Custom pulse demonstrates the loading-label lifecycle hook using the Web Animations
API; its start/update/destroy counters are available in `window.loadingLabelPreview`.
The Thinking icon controls select a built-in or registered custom glyph, hide it,
and set icon motion independently of the text animation.
Expansion controls select instant or height motion, its duration, and its CSS easing
independently of the loading labels. Open and close groups and child rows, reverse
a transition, or change settings mid-motion. The automatic toggle enables tool
expansion on first activity and delayed collapse on completion for the next run.
Reduced motion keeps disclosure changes instant.
The mocked comparisons need no backend or API key.

The **Live agent** tester selects **Runtype agent** or **OpenAI Responses** and
uses the same compressed widget build. V5 defaults and turn activity start enabled.
Each provider retains its own in-memory transcript when switching; switching or
changing V4/V5 is disabled while a request runs. A page reload clears those histories.

For **Runtype agent**, configure `RUNTYPE_API_KEY` in
`examples/runtype-hono-proxy/.env`, then run:

```sh
pnpm build:proxy
pnpm dev:runtype-hono-proxy
```

If your environment overrides `UPSTREAM_URL` for a local Runtype checkout, start
that backend too, or set `UPSTREAM_URL=https://api.runtype.com/v1/dispatch` when
starting the proxy to use the hosted API.

The compressed preview forwards dispatch and resume to the canonical proxy's
`/api/chat/dispatch-activity` route on port 43111. Set `PERSONA_RUNTYPE_PROXY_URL` on the
preview server if that proxy runs elsewhere. The existing server-pinned Persona
documentation agent, with a six-turn and six-tool-call allowance for this tester, uses DeepWiki's repository structure, content and question
tools. **Run Runtype example** requests these three stages in order, with progress
updates between them. `AGENT_ID_ACTIVITY` on the proxy can substitute your own hosted
agent; it must have suitable tools for the prompt. Tool access and model behavior
can affect which calls actually run. You can also type your own prompt.

For **OpenAI Responses**, run the Next.js example on port 5205 with its server-side
API key and model options (see `examples/ai-sdk-next/README.md`). **Run OpenAI
example** requests three stages: check OpenAI documentation, check Anthropic, then
compare their streaming contracts, with brief progress updates between stages.

Both routes forward the real stream unchanged. API keys remain in their backend;
Stop cancels the upstream request. Commentary enters turn activity only when the
backend supplies its phase before the text; unclassified prose remains outside.
The tester does not invent phases or tool results. Toggle **Turn activity** or the
rendering controls during or after a response to compare it without another API
request. **V5 defaults** remounts the live widget with its existing messages;
transient timing is not retained across that remount. The mocked **Run all** button
never sends a provider request.

The **Tool rendering** selector compares individual rows, collapsible groups,
summary-only groups, stacks, and cards across all widgets without another request.
**Reasoning layout** selects a row or card, independently of **Reasoning details**
(plain, inset, or panel). Version default preserves V4 presentation and uses
collapsed rows with inset details in V5. Open a reasoning trace, then switch these
controls live or after replay to compare the same content. Manual disclosure,
expansion motion, chevron motion, and turn activity remain coordinated; card layout
provides its own frame without a second nested panel. These controls also apply
to live-provider responses without another request.

**Group summary** selects the view's default, current action, or aggregate batch.
By default, turn activity uses current-action summaries except in stacks; the
ordinary widgets use aggregate summaries. Explicit selections apply to every view.
**Turn activity for this mock** compares the same mocked transcript inside and
outside a whole-turn disclosure.

**Descriptive titles (mock)** toggles a `toolCall.resolveActionTitle` resolver,
independently of turn classification. Active rows show those titles; one active
tool can also supply the group summary. Turn the toggle off to see safe mapped
labels. Cards keep their normal headers; **Custom summaries** demonstrates using
`renderCollapsedSummary`'s resolved `actionTitle`. The mock includes sequential
tools, parallel tools, and completed aggregate labels. The same controls apply to
saved history and the live example; live tools fall back to mapped labels because
the mock resolver has no titles for their call IDs.

**Show raw tool names in details** toggles the developer-facing name line in all
widgets and saved history. Names are hidden by default in rows and cards, including
V4. **Elapsed timing** controls compact automatic timing on rows, V5 cards, and
collapsible group headers; sub-second calls remain quiet. Expanded details have
no duration footer. V4 card titles retain their legacy timing, and whole-turn
timing stays independent. **Custom summaries** demonstrates authored elapsed
context; render hooks still receive exact timing metadata for diagnostic displays.

Enable **Long reasoning (next mock run)** before starting the mocked widgets to stream twelve additional paragraphs. Open reasoning details and use **Reasoning height** to switch live between the V5 240px default, a custom 140px cap, and unlimited height. Compare each appearance and layout, keyboard scrolling, and height expansion without making an external request.

**Shared overflow**, **Tool overflow override**, and **Reasoning overflow override** update existing mock and live-agent history. Compare the V5 240px cap/12px fade, a shorter shared cap, height-only per-kind overrides, fade-only overrides, no fades, unlimited height, and reset. Enable **Long reasoning** and **Long tool request/response** before a mock run. Scroll each Request and Response separately: only hidden edges fade, while labels, copy controls, panel frames and focus outlines remain clear. Compare all reasoning appearances/layouts and both defaults versions. **Reasoning compatibility height** explicitly overrides theme height; resetting restores inheritance.
