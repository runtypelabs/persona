# Bento Slides + Persona: a slide editor you can talk to

[Bento Slides](https://bento.page/slides) is a single-file presentation editor
(MIT, [nyblnet/bento](https://github.com/nyblnet/bento)). This example embeds
Persona inside it as **Bento Copilot**: a voice-and-text assistant that edits
the live deck through the page's own WebMCP tools and can drive a running
slideshow hands-free.

- **Talk to it.** The composer mic opens a GPT-Live call. The voice model
  handles the conversation itself and hands every real request ("add a pricing
  slide with three tiers", "make the title pop", "jump to the roadmap") to the
  widget's chat pipeline (client delegation), which runs the page tools with the
  same approvals, slide thumbnails and ⌘Z as a typed message, then reads the
  answer back.
- **Present by voice.** Start a show and a small call pill stays above the
  overlay. "Next", "go back", "jump to the pricing slide", "end the show" map
  onto the presenter tool set the page swaps in while presenting.
- **Five more doors into the same session:** the Copilot tab in the right rail
  (⌘J), a Firefly-style selection bar with one-shot verbs, a ⌘K palette whose
  free text falls through to the Copilot, a ghost prompt on empty slides, and
  `@copilot` inside review comments.

The hosted agent is a Runtype agent on **Qwen 3.8 27B** with GPT-Live
(`gpt-live-1`, voice `marin`) as its speech-to-speech lane. The browser only
holds a publishable, origin-scoped client token.

## Run it

```bash
pnpm install            # from the repo root
pnpm --filter bento-slides dev
```

Open the printed URL, press **⌘J** (or the ✨ Copilot tab), and either type or
tap the mic. Chrome is the best bet for the voice path (microphone + WebCodecs).

To point it at your own agent (a staging one, say), set `VITE_RUNTYPE_API_URL`,
`VITE_RUNTYPE_AGENT_ID` and `VITE_RUNTYPE_CLIENT_TOKEN` in `slides/.env.local`.
The agent needs `webmcp` enabled on its chat surface, approvals for
`delete_slide` / `delete_elements` / `set_theme`, and a voice block of
`speech.mode: "speech_to_speech"` with `openai` / `gpt-live-1` on both lanes
and `interruptionMode: "barge-in"`.

`pnpm --filter bento-slides build:single` produces the self-contained
`slides/dist-single/Bento_Slides.bento.html` with the Copilot (and Persona)
bundled into the file.

## Layout

```
kernel/   shared Bento kernel (document lifecycle, i18n engine, charts, sync)
slides/   the slides app; src/ai/ is the Copilot layer added here
scripts/  postbuild-compress.mjs (+ lib/b86.mjs) for the single-file build
```

`slides/src/ai/`:

| file | role |
| --- | --- |
| `tools.ts` | the WebMCP tool surface (23 tools: deck/slide/element reads and writes, comments, presenting) + the presenter-mode swap |
| `pane.ts` | Persona mounted headless in the rail; voice provider; native transcript (slide thumbnails, before/after approval previews) |
| `voice.ts` | the live-call pill (status mirror + hang up, "Talk to Copilot" while presenting) |
| `quiet.ts` | turn choreography: working pill, provenance shimmer on touched elements, toasts |
| `selectionbar.ts`, `palette.ts`, `ghost.ts`, `comments.ts` | the other doors |
| `mentions.ts`, `snapshot.ts`, `thumbs.ts` | `@` context (slides get a rendered PNG attached), slide renders for the transcript |
| `models.ts` | the agent id, client token and API host (env-overridable) |

## Syncing with upstream Bento

`kernel/`, `slides/` and `scripts/` are a copy of upstream at
`nyblnet/bento@b88508c6` (1.2.6). Local divergence is deliberately small:

- `slides/package.json` is folded into this directory's `package.json` (one
  pnpm workspace package); `slides/vite.config.ts` reads `../package.json`.
- Editor hooks for the Copilot: the right rail's Design | Copilot tabs,
  `paletteCommands()`, `onPresentChange` / `presentSession`, the selecto guard
  in `canvas.ts`, `PresentSession.next/prev/goToPosition/currentIndex`, and the
  `src/ai/` import in `main.ts`.
- The Copilot's CSS is appended to the end of `slides/src/styles.css`.
- Two kernel touches: `net.ts` gains `onOfflineEnforced()` (so offline mode
  also unmounts the Copilot and hangs up its call), and `charts.ts` guards the
  tooltip swatch colour (`safeCssColor`) against markup in chart options. The
  latter is an upstream fix worth sending back.

To resync: `git -C <bento> archive origin/main kernel slides scripts/postbuild-compress.mjs scripts/lib/b86.mjs | tar -x -C examples/bento-slides`,
drop `slides/package.json` and `slides/probe/`, then re-apply the hooks above.
