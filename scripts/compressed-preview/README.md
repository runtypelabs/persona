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
the built widget. **Run both** streams four mocked tool calls over three iterations,
with pauses between batches. Run again to check that historical groups stay done.
The switches exercise custom summaries and group-only icon visibility; expand a
group to check its child rows. The animation selector applies the same style to
waiting labels, individual tools, and group headers, and can be changed mid-run.
Custom pulse demonstrates the loading-label lifecycle hook using the Web Animations
API; its start/update/destroy counters are available in `window.loadingLabelPreview`.
The Thinking icon controls select a built-in or registered custom glyph, hide it,
and set icon motion independently of the text animation.
No backend or API key is required.
