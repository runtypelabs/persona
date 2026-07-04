---
"@runtypelabs/persona": minor
---

Context mentions: hardening and true-lazy loading.

- **Bundle:** the menu/chip runtime is now lazy for ESM/CJS consumers too, not
  just the CDN — a new external `./context-mentions` subpath keeps it out of
  `dist/index.{js,cjs}` (previously inlined by the `--splitting false` build, ~8.6
  kB gz for every consumer even with the feature off). Menu-only CSS moved into
  the lazy chunk and is injected on open, which also fixes an unstyled menu under
  `useShadowDom`.
- **Correctness:** structured `context.mentions` no longer re-attaches an older
  turn's mentions to every later send; the composer menu is skipped during IME
  composition; the affordance-button picker strips a live typed `@query` on
  select; outside-click dismiss now cancels in-flight searches; the highlight
  follows its item when async results reorder; and submit no longer double-fetches
  a mention that was still resolving.
- **Accessibility / UX:** `aria-activedescendant` mirrored onto the composer and
  `aria-selected` toggled per option; Home/End navigation; a single empty state;
  a Retry on failed source groups; ≥44px touch targets and a 16px picker input
  (no iOS zoom); chips expose full labels via `title` and show an error icon.
- Also fixes a lookbehind regex that shipped in the core bundle and broke the
  whole widget on Safari < 16.4.
