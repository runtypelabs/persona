# Phase 14: showcase authoring and migration guidance

Status: implemented as bounded showcase and host/SDK example slices, 2026-10-13. Builds on [Phase 13 replacement coverage](phase-13-replacement-plan.md) and its [deprecation audit](phase-13-deprecation-audit.md). No runtime aliases, defaults or exports are removed. The CDN installation range remains `@4`.

## Implemented authoring changes

| Entry point | Change and preserved behavior |
| --- | --- |
| Homepage (`apps/web/src/main.ts`) | Welcome title/subtitle now use `welcome`; starter items use `suggestions.starters`. Preserves card welcome, composer chips, wrapping and four-item cap in both inline and launcher mounts. |
| Theme Copilot (`apps/web/src/theme-configurator/copilot.ts`) | Authors modern welcome and starters; keeps screenshot attachments, local state key, WebMCP approval behavior and dock geometry. Explicit four-item cap retains all four prompts. |
| Inline theme editing (`apps/web/src/theme-configurator/inline-editor.ts`) | Text edits target `welcome.title/subtitle`. The suggestion-radius edit targets `theme.components.suggestion.chip.borderRadius` rather than the shared secondary-button radius. Imported legacy content still supplies the displayed text until edited. |
| Docked Panel (`apps/web/src/docked-panel-demo.ts`) | Modern welcome/starters, preserving the four tool-walkthrough prompts and their order. Existing theme/behavior configuration remains in its established groups. |
| Tool Approval, File Attachments and Agent Loop | Modern welcome/starters in their source configs. Preserves placeholders, callback/streaming integration, mount modes and explicit chip/composer/wrap/four-item presentation. |
| Client Token (`apps/web/src/client-token-demo.ts`) | Phase 13 already fixed typed semantic colors and modern content. Phase 14 makes chip/composer/wrap/four-item presentation explicit. |
| README and migration guide | README points readers at the modern paths and lab. The guide adds before/after content examples, empty-list and hidden-welcome mapping, mounted alias clearing, JSON-reset caveats, independent light/dark control examples, scoped parent resets and a review matrix. |
| Host matrix (`examples/echo-{express,hono,script-tag,sveltekit}`) | Each host frontend now authors `welcome` and `suggestions.starters`, preserving its exact greeting, three prompts, placeholder, theme and mount. All pin card welcome and wrapped composer chips with a four-item cap. Canonical wire/adapter copies are unchanged. |
| SDK examples (`ai-sdk-next`, `eve-next`, `langgraph-next`, `openai-agents-next`) | The React wrappers now author modern welcome/starters and accept `starterItems`; their page callers use the matching prop. Preserves prompt order, optional-item fallback, transparent intro-card styling, cleanup and Markdown processing. Card/chip/composer/wrap/four-item presentation is explicit. |
| AI SDK WebMCP (`examples/ai-sdk-webmcp/app/lib/widget.ts`) | Modern welcome/starters retain all four storefront prompts, placeholder, light/dark themes, page-tool approval policy and proxy routes. Existing default-config spreads remain; their inherited compatibility fields are not newly authored legacy overrides. |
| Hosted script tag (`examples/runtype-script-tag/index.html`) | Modern welcome/starters preserve the greeting, three prompts, client-token setup, theme and inline installer mount. The existing CDN URL is unchanged. Its published Persona 4.29.0 source was checked for `welcome` and starter item/variant/placement/overflow/cap support before migration. |

The changed demos currently use V4 defaults. The explicit starter presentation/cap also makes their appearance stable if a host opts into V5. Choosing only modern item names would be insufficient: V5 can otherwise move starters into the welcome and lower the embedded cap to three.

## Executable showcase

`/style-migration.html` is now a production Vite entry and an entry in the established gallery/picker/command-palette registry. The homepage patterns also link it. It uses the shared examples navigation and reserves its fixed-header offset at wide and narrow widths.

The comparison columns use actual Persona welcome, header, composer, mic, tool and public approval component renderers. Both styled fixtures pin a card welcome and wrapped composer chips; the legacy fixture deliberately retains old content/style fields to demonstrate compatibility. Matching light/dark palettes are expressed as legacy colors or `theme.components`/`darkTheme.components`. The baseline keeps each defaults mode's own appearance. Unsupported browser dictation produces an explanation instead of crashing the page.

The live portion mounts one widget with `persistState: false` and a browser-local echo fetch. Its controls apply sparse `widget.update()` patches:

1. Apply an explicitly labeled legacy fixture.
2. Add component theme values behind it, showing legacy precedence.
3. Clear the finite fixture's legacy aliases with own `undefined` while applying modern content/theme in the same update.
4. Reset style overrides, preserving modern content and unrelated callbacks/layout settings.

Theme/defaults/width/style controls preserve the mounted widget and its draft/conversation. Scene replay separately clears the sample transcript/artifacts. Scenes cover welcome/starters, tool details with an actionable local approval, a real question sheet, and a Markdown artifact pane. Approval messages use canonical message IDs and fresh approval IDs per replay; scene timestamps order the request before the tool and approval. Tool grouping is explicitly disabled in this lab to keep the styled surfaces visible. The last-patch display retains literal `undefined` rather than silently losing resets to JSON serialization.

Raw tool/question/approval sample messages continue to use the existing `injectTestMessage` fixture helper. `injectMessage` does not expose `variant`, `toolCall`, `approval` or `agentMetadata` in its options, so changing the helper would lose the state under comparison. This is a local fixture exception, not new general-purpose injection guidance.

## Remaining first-party inventory

This is a bounded audit of authoring paths, not an exhaustive public-token census. Searches covered `apps/web/src`, standalone HTML, `examples`, README and docs, excluding tests and vendored wire helpers. The main reproducible content/launcher inventory uses these literal property names:

```sh
rg -l 'welcomeTitle\s*:|welcomeSubtitle\s*:|showWelcomeCard\s*:|suggestionChips\s*:|suggestionChipsConfig\s*:|closeButton(Color|Size|BackgroundColor)\s*:' \
  apps/web/src apps/web/standalone examples README.md docs \
  --glob '!*.test.*' --glob '!phase-*' --glob '!*-plan.md' \
  --glob '!suggestions-ux-research.md' --glob '!persona-wire.ts'
```

Additional style searches inspected send/voice colors, local question styles, artifact pane chrome, and inline-editor paths. Remaining uses fall into these groups:

| Remaining group | Files or scope | Disposition |
| --- | --- | --- |
| Intentional migration parity fixture | `apps/web/src/style-migration-config.ts`; before/after tables/snippets in `docs/style-migrations.md` | Retained and explicitly labeled. Removing aliases here would erase the comparison. |
| Imported configuration compatibility | `apps/web/src/theme-configurator/state.ts` | Retains legacy fields when loading/reconciling imported configs and generating snapshots. Fresh inline welcome/radius edits now target modern paths. This is not evidence that every imported or externally default-filled config has known provenance. |
| Empty-list suppression and QA fixtures | `artifact-demo.ts`, `artifact-display-preferences-demo.ts`, `dynamic-form-fields-demo.ts`, `history-demo.ts`, `history-e2e.ts`, `scroll-engineering.ts` | Old empty starter lists remain. They are supported and prevent unrelated default prompts in focused demos; a future migration must preserve explicit `items: []`. `history-e2e` remains a hidden browser fixture. |
| Feature demos with legacy content | `action-middleware-demo.ts`, `analytics-agent-demo.ts`, `bakery-demo.ts`, `client-token-feedback-demo.ts`, `context-mentions-demo.ts`, `custom-loading-indicator.ts`, `custom-voice-provider-demo.ts`, `dynamic-form-demo.ts`, `event-stream-testing.ts`, `feedback-integration-demo.ts`, `focus-input-demo.ts`, `fullscreen-assistant-demo.ts`, `persistent-composer.ts`, `selection-explain-demo.ts`, `server-tts-demo.ts`, `slash-commands-demo.ts`, `smart-dom-reader-demo.ts` | Supported authoring debt, not newly declared parity fixtures. Deferred from this representative slice so each demo's copy/state updates and visible starter behavior can be reviewed together. |
| WebMCP/on-device content demos | `webmcp-demo.ts`, `webmcp-calendar/main.js`, `webmcp-slides/main.ts`, `webmcp-paint/main.ts`, and `litert-{intake,paint,shop,slides}/main.ts` | Legacy welcome/starters remain. These demos include custom theme/starter sizing and model/tool integration; migrate with their individual visual/integration checks. |
| Assistant and starter recreations | `assistant-presets.ts`, `recreation-composer-presets.ts`, `suggestion-recreations.ts` | Some supported send/header/voice/action styling remains. Independent component tokens need per-preset light/dark and geometry review; behavioral/action colors are not automatically deprecated. No blanket replacement was performed. |
| Standalone shop/script samples | `sample.html`, `shopify.html`, `example-shop.html`, `example-shop-metadata.html`, `example-shop-installer.html`, `example-shop-installer-voice-metadata.html`, `lifecycle-events.html` | Supported legacy fields remain in both user config and adapters. A coherent follow-up must migrate displayed/copied snippets and adapter forwarding together, while retaining the installed major range. |
| Example default spreads and protocol fixtures | `examples/ai-sdk-webmcp/app/lib/widget.ts`; host/SDK wire helpers, adapters and tests | Authored welcome/starters in the host matrix and SDK group above are migrated. The WebMCP example still spreads `DEFAULT_WIDGET_CONFIG` and its `copy`/`features`, so inherited legacy defaults remain supported. Protocol `suggestions` payloads and compatibility fixtures are retained; they are not starter config aliases. Existing optional V5 recipes in `ai-sdk-next/README.md` remain opt-in and do not change the runtime examples' V4 defaults. |
| Historical design docs and package reference | Existing phase plans/research, and legacy compatibility tables in `packages/widget/THEME-CONFIG.md` | Retained as historical/reference context. References to a supported legacy field are not themselves new authoring defaults. No package files changed in this slice. |

The remaining content inventory above is intentionally explicit: Phase 14 does not claim that all first-party demos are migrated or that supported aliases are dead. Existing no-op fields, behavioral configuration, CSS compatibility variables and third-party/plugin usage keep the qualifications in the Phase 13 guide.

## Original showcase slice verification

- Showcase TypeScript check passes.
- Four migration-lab tests cover same-mount updates, own-undefined reset origin in V4/V5, retained unrelated behavior, explicit starter presentation/cap, isolated persistence, raw question/artifact/approval fixtures, approval replay IDs and scene ordering.
- Full showcase tests and production Vite build pass; root review records final run counts and logs.
- Browser review exercised draft preservation through migration/reset/scheme/width controls, real question and artifact scenes in dark/narrow mode, and local approval resolution/replay. Final screenshots and computed-style review are recorded by the root review.
- No published package source/types/styles/dependencies changed; no new runtime changeset is needed. No generated upstream contract was regenerated.

## Example slice verification

The host/SDK follow-up above was checked separately with Node 24.13.0 (`PATH="/Users/becomevocal/.nvm/versions/node/v24.13.0/bin:$PATH"`):

```sh
pnpm --filter echo-express --filter echo-hono --filter echo-script-tag --filter echo-sveltekit --filter ai-sdk-next --filter ai-sdk-webmcp --filter eve-next --filter langgraph-next --filter openai-agents-next lint
pnpm --filter echo-express --filter echo-hono --filter echo-script-tag --filter echo-sveltekit --filter ai-sdk-next --filter eve-next --filter langgraph-next --filter openai-agents-next test
```

- All nine example TypeScript/Svelte checks passed; Svelte reported zero errors and warnings. The eight existing offline test suites passed all 53 tests. `ai-sdk-webmcp` has no test script, and `runtype-script-tag` has neither lint nor test scripts.
- A one-off transpile/evaluation smoke check compared the ten config entry points against their pre-migration versions, mapping only welcome/starters to the modern equivalent. Exact greeting/placeholder/prompt content, other supplied config and callbacks were preserved; none opts into V5. Inline script syntax and React/Svelte wrapper construction were included.
- Browser review compared Hono before/after greeting and starter text plus settled geometry for the welcome, starter strip/buttons, textarea, send and mic. A starter click dispatched successfully and produced the expected SSE response. This browser check covers Hono, not every SDK/provider integration.
- The existing wire-helper synchronization check passed for all 14 copies. Canonical host adapters, protocol fixtures, dependencies and published package sources remain unchanged. `git diff --check` passed.
