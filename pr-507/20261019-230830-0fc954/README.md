## Persona verification

<sub>branch `fix/connectstream-replay-coalescing` · captured at `2cb7fb54e4 + uncommitted changes (51dad451d3fc)`, `2cb7fb54e4 + uncommitted changes (452ef5887115)` · run `20261019-230830-0fc954` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| tool-calls | ✅ verified | Live tool turn via composer: tool bubble, answer streams, 'Used tool' expands to details; 1 request, assistant:complete x2 at same timings as main (1572/4085 ms vs 1611/4130 ms). |
| streaming | ⏭️ not driven | Plain text streaming not separately driven; covered by unit tests (ui.streaming-coalescing). |

### tool-calls

**replay 2000 tool calls - after fix**

<img src="./01-tool-calls-replay-2000-tool-calls-after-fix.gif" alt="replay 2000 tool calls - after fix" width="640">

<img src="./01-tool-calls-replay-2000-tool-calls-after-fix.contact-sheet.png" alt="replay 2000 tool calls - after fix" width="640">

[`01-tool-calls-replay-2000-tool-calls-after-fix.webm`](./01-tool-calls-replay-2000-tool-calls-after-fix.webm)

**2000 replayed, last bubble expanded**: connectStream replay of 2000 tool pairs: 298 ms, 2000 bubbles, heap 40 MB; last bubble expands to item_1999 details

<img src="./02-tool-calls-2000-replayed-last-bubble-expanded.png" alt="2000 replayed, last bubble expanded" width="640">

[`02-tool-calls-2000-replayed-last-bubble-expanded.aria.txt`](./02-tool-calls-2000-replayed-last-bubble-expanded.aria.txt)

**replay 200 tool calls - before fix (main)**

<img src="./03-tool-calls-replay-200-tool-calls-before-fix-main.gif" alt="replay 200 tool calls - before fix (main)" width="640">

<img src="./03-tool-calls-replay-200-tool-calls-before-fix-main.contact-sheet.png" alt="replay 200 tool calls - before fix (main)" width="640">

[`03-tool-calls-replay-200-tool-calls-before-fix-main.webm`](./03-tool-calls-replay-200-tool-calls-before-fix-main.webm)

**before fix: 200 replayed on main**: main: connectStream replay of 200 tool pairs blocked the main thread for 5419 ms

<img src="./04-tool-calls-before-fix-200-replayed-on-main.png" alt="before fix: 200 replayed on main" width="640">

[`04-tool-calls-before-fix-200-replayed-on-main.aria.txt`](./04-tool-calls-before-fix-200-replayed-on-main.aria.txt)

**live tool turn via composer**

<img src="./05-tool-calls-live-tool-turn-via-composer.gif" alt="live tool turn via composer" width="640">

<img src="./05-tool-calls-live-tool-turn-via-composer.contact-sheet.png" alt="live tool turn via composer" width="640">

[`05-tool-calls-live-tool-turn-via-composer.webm`](./05-tool-calls-live-tool-turn-via-composer.webm)

**live tool turn, details expanded**

<img src="./06-tool-calls-live-tool-turn-details-expanded.png" alt="live tool turn, details expanded" width="640">

[`06-tool-calls-live-tool-turn-details-expanded.aria.txt`](./06-tool-calls-live-tool-turn-details-expanded.aria.txt)

**live tool turn side effects**: 1 request(s) crossed the network boundary, 3 controller event(s)

[`07-tool-calls-live-tool-turn-side-effects.page.json`](./07-tool-calls-live-tool-turn-side-effects.page.json)

**main baseline events (comparison)**: 1 request(s) crossed the network boundary, 4 controller event(s)

[`08-tool-calls-main-baseline-events-comparison.page.json`](./08-tool-calls-main-baseline-events-comparison.page.json)

**live tool turn side effects (settled)**: 1 request(s) crossed the network boundary, 4 controller event(s)

[`09-tool-calls-live-tool-turn-side-effects-settled.page.json`](./09-tool-calls-live-tool-turn-side-effects-settled.page.json)

