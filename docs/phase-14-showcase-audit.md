# Phase 14: showcase authoring and migration guidance

Status: implemented as bounded showcase, host/SDK example, feature-demo, WebMCP/on-device, assistant/recreation and standalone embed slices, through 2026-10-15. Builds on [Phase 13 replacement coverage](phase-13-replacement-plan.md) and its [deprecation audit](phase-13-deprecation-audit.md). No runtime aliases, defaults or exports are removed. The documented installation range remains `@4`; the standalone consolidation and loader choices are recorded below.

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
| Feature demos (`action-middleware-demo.ts`, `analytics-agent-demo.ts`, `bakery-demo.ts`, `client-token-feedback-demo.ts`, `context-mentions-demo.ts`, `custom-loading-indicator.ts`, `custom-voice-provider-demo.ts`, `dynamic-form-demo.ts`, `event-stream-testing.ts`, `feedback-integration-demo.ts`, `focus-input-demo.ts`, `fullscreen-assistant-demo.ts`, `persistent-composer.ts`, `selection-explain-demo.ts`, `server-tts-demo.ts`, `slash-commands-demo.ts`, `smart-dom-reader-demo.ts`) | Authored greeting fields now use `welcome`; authored starter lists now use `suggestions.starters` with explicit chip/composer/wrap/four-item presentation. Analytics, fullscreen assistant and persistent storefront retain hidden built-in welcomes via `variant: "none"`; the storefront slot stays visible. Dynamic order-state greetings, feedback-mode copy, mention display variants and live configuration builders retain their expressions. Context mentions and the optional hosted voice widget explicitly retain `items: []`. Analytics retains follow-up exposure and its supported chip `fontFamily`; its weight/padding use equivalent `theme.components.suggestion.chip` values. |
| Empty-list demos and QA (`artifact-demo.ts`, `artifact-display-preferences-demo.ts`, `dynamic-form-fields-demo.ts`, `history-demo.ts`, `history-e2e.ts`, `scroll-engineering.ts`) | All six starter suppressions now explicitly author `suggestions.starters.items: []`, retaining chip/composer/wrap/four-item presentation for future updates. Artifact and Scroll Engineering copy now uses modern welcome fields. The existing History hero and hidden `history-e2e` welcome stay unchanged. `history-e2e` remains a hidden browser fixture. |
| WebMCP/on-device demos (`webmcp-demo.ts`, `webmcp-calendar/main.js`, `webmcp-slides/main.ts`, `webmcp-paint/main.ts`, `litert-{intake,paint,shop,slides}/main.ts`) | All eight authored greetings now use `welcome`; starter lists use `suggestions.starters` with card welcome and chip/composer/wrap/four-item presentation. Exact copy and prompt order remain, including Paint's six configured items and LiteRT Shop's five configured items behind the existing four-item visible cap. Calendar's chip weight `700` now uses `theme.components.suggestion.chip.fontWeight`. Both Paint pages and LiteRT Shop retain supported `suggestionChipsConfig.fontFamily`. Theme palettes, mount geometry, model loaders/guards, tool approval/execution, request/context callbacks and persistence keys remain unchanged. |
| Assistant and starter recreations (`assistant-presets.ts`, `recreation-composer-presets.ts`, `suggestion-recreations.ts`) | Custom send glyph sizes/strokes and idle mic colors/borders now use independent component tokens. Send colors in assistant presets move to `composer.send` with matching `voice.control` values to preserve their historic mic fallback. The 44px assistant and 40px Gemini recreation send boxes use component size tokens; explicit 32px/36px boxes remain because modern sizes enforce a different coarse-pointer minimum. Exact product palettes, active mode styling, hooks, visibility, and custom stop glyphs remain. Exported/copied configs derive from these same builders. |

The content-migrated demos retain V4 defaults; the assistant presets retain their existing V5 opt-in. The explicit starter presentation/cap in the content slices also makes their appearance stable if a host opts into V5. Choosing only modern item names would be insufficient: V5 can otherwise move starters into the welcome and lower the embedded cap to three.

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
| WebMCP/on-device inherited defaults and supported settings | Migrated WebMCP/on-device demos above | Existing `DEFAULT_WIDGET_CONFIG`/`copy` spreads remain and can carry inherited compatibility fields. Both Paint pages and LiteRT Shop retain supported `suggestionChipsConfig.fontFamily`, an accepted renderer no-op without a component-token replacement. These are not newly authored legacy welcome/starter overrides. |
| Assistant/recreation touch geometry and supported action styling | `assistant-presets.ts`, `recreation-composer-presets.ts`, `suggestion-recreations.ts` | Explicit sub-40px `sendButton.size` remains: it opts out of the coarse-pointer 40px minimum, whereas `composer.send.size` honors that floor. There is no equivalent modern override for that geometry. Supported per-action `iconColor`/`backgroundColor` and per-item suggestion icon colors retain their scope; shared ghost tokens would affect unrelated controls and active modes. No authored header style aliases occur in these files. All other authored send/voice style aliases in this group are migrated. |
| Standalone embeds | `sample.html`, `example-shop.html`, `preview-mode.html`, `lifecycle-events.html` | Consolidated to four focused examples. Shopping capabilities use one installer/metadata integration; the former Shopify and shop variants redirect. Historical dormant styling was removed with the duplicate implementations. See the consolidation section below. |
| Example default spreads and protocol fixtures | `examples/ai-sdk-webmcp/app/lib/widget.ts`; host/SDK wire helpers, adapters and tests | Authored welcome/starters in the host matrix and SDK group above are migrated. The WebMCP example still spreads `DEFAULT_WIDGET_CONFIG` and its `copy`/`features`, so inherited legacy defaults remain supported. Protocol `suggestions` payloads and compatibility fixtures are retained; they are not starter config aliases. Existing optional V5 recipes in `ai-sdk-next/README.md` remain opt-in and do not change the runtime examples' V4 defaults. |
| Feature-demo inherited defaults and supported settings | Migrated feature/QA demos above; `analytics-agent-demo.ts` | Existing `DEFAULT_WIDGET_CONFIG` spreads remain. Event stream, selection explain, slash commands and fullscreen assistant did not author starter lists and retain their inherited V4 defaults. Analytics retains supported `suggestionChipsConfig.fontFamily`; deprecated font weight and padding overrides are migrated. Other pre-existing feature styles and behavioral settings are outside this content slice. |
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

## Feature-demo slice verification

The 23 feature/QA sources above were checked with Node 24.13.0:

```sh
pnpm --filter web typecheck
pnpm --filter web test:run
pnpm --filter web exec vite build
git diff --check
```

- Showcase TypeScript passed; all 37 test files and 280 tests passed; the production Vite build passed. Existing plugin fixture diagnostics about missing composer markers and build chunk-size/static-versus-dynamic-import notices were emitted without failures.
- A one-off TypeScript AST parity check compared all 23 sources against their pre-migration versions, mapping only modern welcome/starter config back to its legacy equivalent and checking Analytics' equivalent chip weight/padding. Exact copy, starter items/order, dynamic expressions, callbacks and unrelated config/code matched. All 20 migrated starter configs pin chip/composer/wrap/four-item presentation; eight explicitly empty lists remain empty, including Context Mentions and the optional hosted voice mount. The check does not claim every remote integration was exercised.
- The scoped legacy-property inventory now contains only Analytics' supported `suggestionChipsConfig.fontFamily`. Existing default spreads remain, as qualified in the remaining inventory above. Fresh mounts, remounts and live builder updates no longer author competing legacy greeting/starter aliases.
- Browser review compared Focus Input's settled welcome/title/subtitle/textarea/starter geometry and fonts before/after, with no differences; its focus control still focuses the textarea. Context Mentions retained its welcome geometry and empty starter row; selecting `App.tsx` created a context chip, and switching to inline mention display updated the correct greeting/placeholder. History retained the Messages hero with no starters and loaded a seeded conversation through the local Messages view. Analytics retained its hidden built-in welcome, two starter prompts, weight `620` and padding `10px 14px`. These pages emitted no console errors.
- Further browser coverage should exercise Dynamic Components' live style variants in both mount modes, the persistent storefront slot alongside its hidden built-in welcome, artifact replay/preferences after remount, and the responsive Scroll Engineering mount. Authenticated feedback/proxy requests and voice capture/playback were not exercised by this slice.
- No published package, protocol fixture, standalone sample or CDN URL changed; no changeset is required.


## WebMCP/on-device slice verification

The eight WebMCP/on-device sources above were checked with Node 24.13.0:

```sh
pnpm --filter web typecheck
pnpm --filter web test:run
pnpm --filter web exec vite build
git diff --check
```

- Showcase TypeScript passed; all 37 test files and 280 tests passed; the production Vite build and `git diff --check` passed. Existing plugin fixture diagnostics about missing composer markers and build chunk-size/static-versus-dynamic-import notices were emitted without failures.
- A one-off TypeScript AST parity check compared all eight complete sources against their pre-migration versions after reversing only the welcome/starter mapping and Calendar's equivalent chip-weight relocation. Exact greeting/placeholder copy, all 34 starter items and their order, callbacks, model/tool integration and unrelated code/config matched. Every authored starter config explicitly retains chip/composer/wrap/four-item presentation; the original sources contain no authored empty starter lists. Existing runtime precedence was inspected: modern welcome fields win per field, modern starter items win over inherited legacy lists, and the retained default-config provenance lets Calendar's explicit component weight override the inherited compatibility weight.
- The scoped authored legacy-property inventory now contains only the three supported `suggestionChipsConfig.fontFamily` settings. There are no greeting/starter forwarding adapters, copied config snippets or mounted content updates in these eight source files. The storefront's mode builder and every mount use the same migrated authored config paths; default spreads remain supported.
- Browser review compared Calendar Copilot and LiteRT Intake against their pre-migration settled greeting/starter/control geometry, fonts and text with exact matches. All eight page previews mounted with the expected authored welcome and prompts; both Paint pages and LiteRT Shop retained the visible four-item cap. Calendar's next-week control still advances the calendar heading. The WebMCP Paint iframe completed loading with the jspaint canvas visible, and its advertised `get_canvas_info` tool returned the live 683×384 canvas, pencil tool and black/white colors. Two `MutationObserver.observe` non-Node console errors were observed while navigating the Paint iframe pages; their source remains unattributed, so this review does not classify them as a regression or a pre-existing issue. This slice changes no observer/iframe implementation. The Intake sample-story submission was not counted as a model/tool execution check.
- On-device model downloads/generation and authenticated proxy/model requests were not exercised. Static parity does not establish that every WebMCP tool or remote integration ran successfully.
- No package source/types/styles/dependencies, protocol fixture, model engine, CDN URL or generated contract changed; no changeset is required.


## Assistant/recreation slice verification

The three assistant/recreation sources above were checked with Node 24.13.0:

```sh
pnpm --filter web typecheck
pnpm --filter web test:run
pnpm --filter web exec vite build
pnpm --filter @runtypelabs/persona exec vitest run src/components/composer-parts.test.ts src/components/composer-actions.test.ts src/components/header-parts.test.ts
git diff --check
```

- Showcase TypeScript passed; all 37 showcase test files and 280 tests passed; the production Vite build passed. The three relevant widget control suites passed all 105 tests. Existing plugin fixture diagnostics and chunk-size/static-versus-dynamic-import build notices remained non-failing. `git diff --check` passed.
- A one-off check evaluated the saved pre-edit and current TypeScript sources. Twenty complete configs (five assistant presets, five composer patches, five mounted recreations and five underlying recreation configs) matched after reversing only the migrated fields, including exact copy, starter items/order, callback source and unrelated settings. Forty parity checks passed. Renderer comparison covered 480 combinations: send/stop and mic idle/recording/processing/barge-in speaking under both V4/V5 defaults and light/dark schemes. Resolved inline/CSS-token colors, borders, padding, control dimensions and SVG content/dimensions/strokes matched. This is a component parity check, not a browser layout check for every state.
- Browser comparison covered all five assistant presets at reference and narrow widths (ten cases), plus all five mounted suggestion recreations with a draft showing Send. Settled control geometry, fonts, colors and SVG dimensions matched; recreation starter animation produced only sub-0.01px floating-point variation. Existing product palettes cover both light and dark schemes. Gemini's simulated streaming state retained its 32px send/stop box, 24px custom stop SVG and 12px inner square; Stop canceled generation. Claude's simulated dictation transitioned through listening/transcribing to an editable draft, and its model menu selected Alternative Medium. These pages emitted no console errors.
- The scoped style inventory retains only the deliberate 32px/36px send-size exceptions and supported per-action/per-item colors. Recording and other active voice styling paths remain unchanged. The assistant lab and recreation config viewer export the same migrated builders; no separately maintained snippet or forwarding adapter was found. Legacy migration fixtures remain intact.
- Browser checks use local simulated dictation/generation; real microphone capture, authenticated providers and remote model integrations were not exercised. No package source/types/styles/dependencies, runtime API, CDN URL or generated contract changed; no changeset is required.

### Claude dictation fidelity follow-up

After the parity migration, direct inspection of Claude's idle Dictate control showed a transparent 32px button, 20px icon and 8px corners. The assistant preset now uses a neutral foreground and transparent background instead of the preserved send-color fallback; the Claude recreation uses the same treatment. Both configure the accessible name/tooltip as `Dictate`, and the assistant lab preserves that preset configuration when enabling its simulated provider. These are intentional appearance changes after the parity checks above, not claims of unchanged rendering. Claude was inspected in dark mode; Persona's light preset uses its own neutral text color. The proprietary icon font is still approximated by Persona's SVG.

A runtime correction also preserves configured microphone labels when browser or session voice returns to idle. Ten focused V4/V5 control tests passed, including custom label updates during recording and provider state transitions. Showcase typecheck, widget build (including bundle budgets), and `git diff --check` passed. Browser verification confirmed the lab's transparent background, neutral foreground, 8px radius, approximately 32px control and 20px SVG; simulated dictation moved through listening/transcribing to an editable draft and restored `Dictate`. Real microphone capture was not exercised. The runtime correction includes a patch changeset.


### Four-assistant live fidelity follow-up (October 14, 2026)

The main assistant lab now follows the audited ChatGPT signed-out dark, Gemini signed-in dark, Perplexity signed-in Search, and personal Copilot variants. ChatGPT has the observed greeting, subtle border and transparent microphone. Gemini has a 660px dark pill, 32px controls, 36px greeting and no Pro picker; its transparent transcript and footer expose a continuous theme gradient across the lab canvas. Perplexity retains its 640px stacked composer with a 52px editor, transparent muted microphone and light voice circle. Copilot replaces the provisional Microsoft 365 treatment with the measured 768px × 60px dark pill, 28px greeting, leading +, no microphone and a transparent 32px send shown only with a draft. Explore / Shop / Play fill local demonstration prompts. Copilot's suggestion recreation shares this measured configuration; the distinct ChatGPT tool/model and Gemini Pro recreation variants remain intentional. The recent Claude appearance and idle-label correction remain intact.

Showcase typecheck and all 37 test files / 280 tests passed. The existing Copilot regression expectation now checks the observed single-row composer, absent model picker/microphone and draft-only send. Browser verification covered all four reference and 380px narrow previews, Copilot's unsent draft, and Gemini's local sample conversation. Measured reference widths were 768 / 660 / 640 / 768px; nominal heights were 52 / 64 / 118 / 60px (the browser reported fractional heights about 0.8px smaller). Narrow forms stayed inside their host without horizontal overflow. Copilot's text baseline is centered using supported editor padding. Gemini's conversation text remained readable against the continuous glow. The development server at 127.0.0.1:5203 was restarted to load the final changes.

Remaining precision limits are explicit in the lab: custom action buttons have no independent size token for ChatGPT's smaller audio circle; Perplexity's mode glyphs share the 16px control token and its toolbar groups share one spacing token, so the observed 14px mode glyphs and mixed 0 / 0 / 8px gaps are approximate. Copilot's starters hide after sending rather than on draft entry; its proprietary prompt gallery is not implemented. System fonts, generic icons and the Gemini gradient approximate proprietary assets and exact live placement. No real microphone, external message or product integration was used. This follow-up adds no widget runtime, package source, dependency or API changes; the prior Claude runtime fix and its changeset are preserved.


## Standalone embed consolidation — 2026-10-15

After migrating authored welcome/starters and forwarding adapters, the standalone inventory was consolidated from eight maintained examples to four:

- `sample.html`: a minimal installer config, rendered copyable snippet, and no shopping middleware.
- `example-shop.html`: one installer-based shopping integration with fresh page context, metadata forwarding, JSON message/click/checkout/navigation actions, local cart feedback, persisted chat/action/voice metadata, and navigation restoration.
- `preview-mode.html`: the existing URL-gated installation example.
- `lifecycle-events.html`: the existing deferred loading/lifecycle example, retaining its migrated starter config and matching displayed snippet.

The four former Shopify/metadata/installer variant URLs are redirect stubs. They retain query strings and fragments, use `location.replace` to avoid a back-button loop, and include a normal fallback link. They remain Vite HTML inputs so production builds preserve bookmarks. Navigation and command-palette entries now expose only the four focused examples.

The minimal and shopping pages use published `@4` assets in production and the local widget build for localhost and IPv4/IPv6 loopback. Existing preview/lifecycle loading behavior is retained. The canonical shop replaces duplicated fetch interception and action execution with SDK context, request middleware, stream parsing and action management. It retains the useful capabilities rather than reproducing every historical implementation or styling override. Unused flat theme keys, dormant button overrides and temporary compatibility close aliases disappeared with those duplicate implementations.

Navigation is restricted to the same storefront, throttled, persisted before departure, and consumed once with a 30-second expiry. Checkout still forwards items to the configured backend; real product/price validation and payment setup belong to that backend. Chat uses a dedicated storage namespace, leaving old shared demo storage untouched. See [standalone setup and integration notes](../apps/web/standalone/README.md).

No published package, runtime default, dependency or protocol fixture changed. No changeset is required. Validation covers actual inline configs/actions, redirects, V4/V5 welcome resolution, copied snippet execution, loopback asset selection, context merging, cart action deduplication, persistence, navigation restoration and checkout requests with a mocked backend. Remote chat, microphone capture, and payments are not exercised by these checks.

Validation passed: 41 showcase test files / 309 tests, the final 16 focused consolidation checks, showcase TypeScript, root lint, and the final Vite production build. Existing non-failing chunk/import build notices remain. Browser QA verified the minimal embed opens and copies its snippet, the canonical shopping page opens and updates the demo cart, an unsent shopping draft survives reload, all four retired URLs preserve query/hash through their redirects, preview gating switches correctly, and lifecycle reaches chat-ready. No browser error logs were observed during those checks; no remote dispatch, microphone activation or payment was performed.
