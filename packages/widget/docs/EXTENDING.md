# Extending Persona

Persona ships **mechanisms, not opinions.** Almost every layer of the widget
(how a message bubble renders, how the stream is parsed, how text is sanitized,
where page context comes from, what voice engine speaks) is a replaceable seam
with a public API. You extend Persona by passing config or registering an
object; you should never have to fork it.

This page is the **map**. Each extension point below links to its deep-dive doc,
names the public symbol(s) you import from `@runtypelabs/persona` (or a subpath),
and shows the smallest snippet that does something real. When you build
something reusable, the **"Contribute it back"** pointer at the end of each
section tells you where it can live in this monorepo.

> Every symbol named here is exported from the package. Verify against
> [`src/index-core.ts`](../src/index-core.ts) and the `exports` map in
> [`package.json`](../package.json). Subpath imports (`/plugin-kit`,
> `/smart-dom-reader`) are real export conditions, not aspirational.

## Map of extension points

| Area | What it customizes | Public API | Deep dive |
| --- | --- | --- | --- |
| [Plugins](#plugins) | Any rendered UI region (14 hooks) | `pluginRegistry`, `AgentWidgetPlugin`, `config.plugins` | [PLUGINS.md](./PLUGINS.md) |
| [Components](#components) | Inline, agent-rendered rich UI | `componentRegistry`, `createComponentStreamParser` | [MESSAGE-INJECTION.md](./MESSAGE-INJECTION.md) · [gallery README](../../../apps/web/src/gallery-components/README.md) |
| [Postprocessors](#postprocessors) | Markdown / directive transforms of message text | `createMarkdownProcessorFromConfig`, `createDirectivePostprocessor` | [CONFIGURATION-REFERENCE.md](./CONFIGURATION-REFERENCE.md) |
| [Themes & theme plugins](#themes--theme-plugins) | Design tokens and runtime theme behavior | `createTheme`, `createPlugin`, `brandPlugin`, `accessibilityPlugin` | [THEME-CONFIG.md](../THEME-CONFIG.md) |
| [Stream parsers](#stream-parsers) | How raw SSE text becomes message content | `createJsonStreamParser`, `createXmlParser`, `createPlainTextParser`, … | [STREAM-PARSERS.md](./STREAM-PARSERS.md) |
| [Stream animations](#stream-animations) | How streamed text reveals on screen | `registerStreamAnimationPlugin`, `StreamAnimationPlugin` | this page |
| [Voice providers](#voice-providers) | Speech-to-text and text-to-speech engines | `createVoiceProvider`, `config.voiceRecognition.custom`, `config.textToSpeech.provider: "custom"` | this page |
| [Sanitization](#sanitization) | The HTML safety boundary | `config.sanitize`, `createDefaultSanitizer` | this page |
| [Action parsers / handlers](#action-parsers--handlers) | AI-emitted actions and their side effects | `config.actionParsers`, `config.actionHandlers`, `defaultActionHandlers` | this page |
| [Context providers / WebMCP](#context-providers--webmcp) | What page context and tools reach the agent | `config.contextProviders`, `config.webmcp`, `@runtypelabs/persona/smart-dom-reader` | [PROGRAMMATIC-CONTROL.md](./PROGRAMMATIC-CONTROL.md) |
| [Layout slots](#layout-slots) | Extra UI injected into fixed regions | `config.layout.slots`, `SlotRenderer` | [CONFIGURATION-REFERENCE.md](./CONFIGURATION-REFERENCE.md) |
| [Storage adapter](#storage-adapter) | Where conversation state persists | `createLocalStorageAdapter`, `config.storageAdapter` | [PROGRAMMATIC-CONTROL.md](./PROGRAMMATIC-CONTROL.md) |
| [UI builders](#ui-builders-for-plugin-authors) | Reusable widget-styled DOM for plugins | `buildHeader`, `createStandardBubble`, `createIconButton`, `renderLucideIcon` | [UI-COMPONENTS.md](./UI-COMPONENTS.md) |

---

## Plugins

Plugins are the broadest seam: a plugin is a plain object with one or more
`render*` hooks, each of which can take over a region of the UI (message bubbles,
launcher, header, composer, reasoning, tool calls, approvals, the
`ask_user_question` sheet, loading/idle indicators, and the event stream).
Return an `HTMLElement` to take over, or `null` to fall through to the default.

```ts
import { pluginRegistry, type AgentWidgetPlugin } from "@runtypelabs/persona";

const badgePlugin: AgentWidgetPlugin = {
  id: "assistant-badge",
  renderMessage: ({ message, defaultRenderer }) => {
    if (message.role !== "assistant") return null; // let the default handle it
    const el = defaultRenderer();
    el.style.width = "100%"; // the hook output is wrapped in a flex row
    el.dataset.badged = "true";
    return el;
  },
};

pluginRegistry.register(badgePlugin); // global: affects every widget instance
// or, per instance: initAgentWidget({ config: { plugins: [badgePlugin] } })
```

**→ Use a plugin / contribute it back:** the full hook reference, priority and
lifecycle rules, and the `@runtypelabs/persona/plugin-kit` helpers live in
**[PLUGINS.md](./PLUGINS.md)**. While Persona is launching, contribute reusable
plugins as in-repo demos, examples, docs, or package source changes.

## Components

Where plugins replace *fixed* UI regions, **components** let the agent render
*arbitrary* rich UI inline by emitting a directive (`{ "component": "Name",
"props": {...} }`). You register a renderer by name; Persona looks it up and
calls it with the props plus a `ComponentContext`.

```ts
import { componentRegistry, type ComponentRenderer } from "@runtypelabs/persona";

const WeatherCard: ComponentRenderer = (props, { message }) => {
  const el = document.createElement("div");
  el.className = "weather-card";
  el.textContent = `${props.city}: ${props.temp}°`;
  return el;
};

componentRegistry.register("WeatherCard", WeatherCard);
```

Pair this with `createComponentStreamParser` to hydrate directives as they
stream. See the directive format and streaming details in
**[MESSAGE-INJECTION.md](./MESSAGE-INJECTION.md)**.

**→ Use a component / contribute it back:** small, self-contained components
belong in the in-repo gallery: copy
[`apps/web/src/gallery-components/_template.ts`](../../../apps/web/src/gallery-components/_template.ts)
and open a PR (the [gallery README](../../../apps/web/src/gallery-components/README.md)
walks through the ~2-minute flow). Larger components can land as in-repo demos
or examples so maintainers can help shape the extension pattern.

## Postprocessors

Postprocessors transform message *text* before it renders, turning markdown
into HTML, or rewriting custom directives. The built-ins are factories you can
compose or replace via `config.postprocessMessage`.

```ts
import {
  createMarkdownProcessorFromConfig,
  createDirectivePostprocessor,
} from "@runtypelabs/persona";

const markdown = createMarkdownProcessorFromConfig({ /* markdown options */ });

initAgentWidget({
  config: {
    postprocessMessage: ({ text }) => markdown(text),
  },
});
```

> **Sanitization still applies.** Output of `postprocessMessage` (and the
> built-in markdown/directive processors) is sanitized by DOMPurify unless you
> override `config.sanitize`. See [Sanitization](#sanitization).

See `postprocessMessage` and the markdown options in
**[CONFIGURATION-REFERENCE.md](./CONFIGURATION-REFERENCE.md)**.

## Themes & theme plugins

Persona's theme system is design tokens (palette → semantic → component) plus
*theme plugins* that mutate the resolved theme at runtime (brand color
injection, accessibility passes, reduced motion, high contrast).

```ts
import { createTheme, createPlugin, brandPlugin } from "@runtypelabs/persona";

const theme = createTheme({
  semantic: { colors: { accent: "#7c3aed" } },
  plugins: [
    brandPlugin({ primary: "#7c3aed" }),
    createPlugin("my-rounding", (t) => ({
      ...t,
      components: { ...t.components, radius: "1rem" },
    })),
  ],
});
```

Built-in theme plugins: `brandPlugin`, `accessibilityPlugin`, `animationsPlugin`,
`reducedMotionPlugin`, `highContrastPlugin`. The full token reference and the
`PersonaThemePlugin` contract are in **[THEME-CONFIG.md](../THEME-CONFIG.md)**.

**→ Contribute it back:** reusable theme plugins and theme examples should land
in this monorepo while Persona is launching, either as package source, demos,
examples, or docs.

## Stream parsers

A stream parser decides how the raw SSE text turns into renderable content. The
built-in factories cover plain text, JSON (including partial/streaming JSON), and
XML; you can write your own by satisfying the `AgentWidgetStreamParser` shape.

```ts
import { createJsonStreamParser, createXmlParser } from "@runtypelabs/persona";

initAgentWidget({
  config: {
    streamParser: createJsonStreamParser({ contentKey: "answer" }),
  },
});
```

Available factories: `createPlainTextParser`, `createJsonStreamParser`,
`createFlexibleJsonStreamParser`, `createRegexJsonParser`, `createXmlParser`.
Full options and the custom-parser contract are in
**[STREAM-PARSERS.md](./STREAM-PARSERS.md)**.

## Stream animations

Stream animations control how already-parsed text is *revealed* (typewriter,
letter-rise, etc.). Register a custom one to sit alongside the built-ins; select
it via `config.features.streamAnimation`.

```ts
import {
  registerStreamAnimationPlugin,
  type StreamAnimationPlugin,
} from "@runtypelabs/persona";

const blinkReveal: StreamAnimationPlugin = {
  type: "blink",
  apply: (ctx) => {
    // ctx exposes the buffer + target element; drive the reveal here
    ctx.element.style.opacity = "1";
  },
};

registerStreamAnimationPlugin(blinkReveal);
// then: config.features.streamAnimation = { type: "blink" }
```

Use `listRegisteredStreamAnimations()` to inspect what's registered and
`unregisterStreamAnimationPlugin(type)` to remove one. The built-in animations
(`typewriter`, `pop-bubble`) ship in the core bundle; `glyph-cycle` and `wipe`
are lazy subpath modules (`@runtypelabs/persona/animations/glyph-cycle`,
`/animations/wipe`).

## Voice providers

Both speech-to-text (`voiceRecognition`) and text-to-speech (`textToSpeech`) are
pluggable. The default STT is the browser Web Speech API; the default TTS is the
browser speech engine. Swap in your own:

```ts
import { createVoiceProvider, type VoiceProvider } from "@runtypelabs/persona";

const myProvider: VoiceProvider = {
  /* start/stop/onResult/onTranscript (see VoiceProvider) */
};

initAgentWidget({
  config: {
    // Speech-to-text: bring your own provider
    voiceRecognition: { enabled: true, type: "custom", custom: myProvider },
    // Text-to-speech: a hosted engine
    textToSpeech: { provider: "custom", createEngine: () => myEngine },
  },
});
```

`createVoiceProvider` / `createBestAvailableVoiceProvider` build a provider from
config; `isVoiceSupported()` feature-detects. The hosted Runtype read-aloud
engine ships from the `@runtypelabs/persona/voice-worklet-player` subpath and is
selected with `textToSpeech: { provider: "runtype" }` (no import needed).

## Sanitization

All rendered markdown/HTML passes through DOMPurify by default. `config.sanitize`
is the seam: `true` (default), `false` (trusted content only), or a custom
`(html: string) => string`. `createDefaultSanitizer()` returns the built-in
function so you can wrap rather than replace it.

```ts
import { createDefaultSanitizer } from "@runtypelabs/persona";

const base = createDefaultSanitizer();

initAgentWidget({
  config: {
    sanitize: (html) => base(html).replace(/<table/g, '<table class="ok"'),
  },
});
```

> When you compare URI schemes in a custom sanitizer hook, always do it
> **case-insensitively** per RFC 3986, e.g.
> `val.toLowerCase().startsWith("data:")` (`DATA:`, `Data:`, and `data:` must
> all be treated alike).

## Action parsers / handlers

"Actions" are structured instructions the model emits (navigate, fill a form,
add to cart). A **parser** extracts them from the stream; a **handler** runs the
side effect. Both are arrays you supply via config, and the built-ins are
exported so you can extend rather than replace them.

```ts
import { defaultActionHandlers, defaultJsonActionParser } from "@runtypelabs/persona";

initAgentWidget({
  config: {
    actionParsers: [defaultJsonActionParser],
    actionHandlers: [
      ...defaultActionHandlers,
      {
        type: "track",
        handle: ({ action }) => { analytics.track(action.payload); },
      },
    ],
  },
});
```

The `AgentWidgetActionParser` / `AgentWidgetActionHandler` types describe the
contracts; `createActionManager` wires them together if you need a standalone
pipeline.

## Context providers / WebMCP

Context providers inject page/editor context into each request; WebMCP exposes
*page actions* to the agent as callable tools. Both run on the agent and
flow/proxy paths.

```ts
initAgentWidget({
  config: {
    contextProviders: [
      { id: "selection", provide: () => ({ selection: getSelection()?.toString() }) },
    ],
    webmcp: { enabled: true }, // snapshots document.modelContext tools
  },
});
```

For Shadow-DOM-piercing page context backed by a vendored smart DOM reader,
import the optional provider. It's deliberately kept out of the main bundle:

```ts
import { contextProviders } from "@runtypelabs/persona/smart-dom-reader";
// initAgentWidget({ config: { contextProviders } })
```

WebMCP execution, approval gating, and resume semantics are documented in
**[PROGRAMMATIC-CONTROL.md](./PROGRAMMATIC-CONTROL.md)**.

### Designing good WebMCP tools

A WebMCP tool is an MCP tool that happens to run in the browser, so the same
tool-design discipline applies: clear names, focused scope, well-described
inputs, and outputs an agent can actually act on.

- **[WebMCP — Chrome for Developers](https://developer.chrome.com/docs/ai/webmcp)** —
  Google's guide to the imperative and declarative APIs, with end-to-end examples.
- **[WebMCP explainer (W3C Web Machine Learning CG)](https://github.com/webmachinelearning/webmcp)** —
  the spec proposal and rationale behind `navigator.modelContext`.
- **[Debug WebMCP tools in Chrome DevTools](https://developer.chrome.com/docs/devtools/application/webmcp)** —
  inspect tool registration, schema validation, and invocation history.
- **[MCP tool design patterns (Arcade)](https://www.arcade.dev/blog/mcp-tool-patterns/)** —
  general MCP tool-design practices that apply directly to WebMCP tools too.

## Layout slots

Slots inject your own UI into fixed regions of the panel without replacing the
surrounding chrome. Provide a `SlotRenderer` per slot.

```ts
import { type SlotRenderer } from "@runtypelabs/persona";

const banner: SlotRenderer = ({ config }) => {
  const el = document.createElement("div");
  el.textContent = "Beta";
  return el;
};

initAgentWidget({ config: { layout: { slots: { "header-end": banner } } } });
```

See the slot names and `SlotRenderContext` in
**[CONFIGURATION-REFERENCE.md](./CONFIGURATION-REFERENCE.md)**.

## Storage adapter

Conversation state persists through a storage adapter. `createLocalStorageAdapter`
builds a `localStorage`-backed one; pass any object matching the
`config.storageAdapter` shape (get/set/remove) to persist elsewhere
(IndexedDB, a server, memory).

```ts
import { createLocalStorageAdapter } from "@runtypelabs/persona";

initAgentWidget({
  config: { storageAdapter: createLocalStorageAdapter({ prefix: "persona:" }) },
});
```

State-loading and restore hooks are covered in
**[PROGRAMMATIC-CONTROL.md](./PROGRAMMATIC-CONTROL.md)**.

## UI builders (for plugin authors)

When a plugin renders its own region but you want it to *look* like Persona, use
the exported builders instead of re-deriving styles: `buildHeader`,
`buildComposer`, `createStandardBubble`, `createBubbleWithLayout`,
`createIconButton`, `createLabelButton`, `createToggleGroup`,
`createDropdownMenu`, and `renderLucideIcon`.

```ts
import { createStandardBubble, createIconButton, renderLucideIcon } from "@runtypelabs/persona";

const bubble = createStandardBubble({ role: "assistant", content: "Hi!" });
const close = createIconButton({ icon: renderLucideIcon("x"), label: "Close" });
```

These pair naturally with the plugin-kit helpers; see
**[UI-COMPONENTS.md](./UI-COMPONENTS.md)** for the full builder catalog and
**[PLUGINS.md](./PLUGINS.md)** for using them inside hooks.

---

## Contributing what you build

Persona is early, so we want reusable customizations to land in this monorepo:

- **A small, self-contained UI component** → PR it into the in-repo gallery using
  the copy-template flow ([gallery README](../../../apps/web/src/gallery-components/README.md)).
- **A full plugin, theme plugin, backend adapter, or other extension** → PR it as
  a demo, example, docs update, or package source change. If the right location
  is not obvious, open a draft PR and maintainers can help place it.
- **A core fix or feature** → PR to the monorepo (see
  [CONTRIBUTING.md](../../../CONTRIBUTING.md); `packages/*` changes need a
  changeset).
