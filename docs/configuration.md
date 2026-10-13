# Authoring a Persona configuration

Start with the settings your application supplies. Use `brand` for a coordinated look, `theme.semantic` for shared design intent, and `theme.components` for an exact exception. The [theme reference](../packages/widget/THEME-CONFIG.md) is an exhaustive reference, not a minimal setup. These recipes use current V4 defaults; none silently enables V5. Add `future: { v5Defaults: true }` deliberately to preview V5 defaults.

## Fresh configuration: change the brand

```typescript
import { initAgentWidget, type AgentWidgetConfig } from '@runtypelabs/persona';

const config = {
  apiUrl: '/api/chat',
  welcome: { title: 'How can we help?' },
  suggestions: { starters: { items: ['Find a product', 'Track an order'] } },
  brand: { accent: '#7c3aed', font: 'Georgia, serif' },
} satisfies AgentWidgetConfig;

initAgentWidget({ target: '#chat', config });
```

All other values inherit defaults. Brand derives coordinated colors, typography, corners, spacing and elevation when the corresponding inputs are supplied. Explicit theme tokens override brand. A brand is a starting point; it does not describe every bespoke layout.

## Fresh configuration: share a design adjustment

```typescript
import { type AgentWidgetConfig } from '@runtypelabs/persona';

const config = {
  apiUrl: '/api/chat',
  colorScheme: 'auto',
  theme: {
    semantic: { colors: { surface: '#faf7f2', text: '#292524' } },
  },
  darkTheme: {
    semantic: { colors: { surface: '#292524', text: '#faf7f2' } },
  },
} satisfies AgentWidgetConfig;
```

Semantic tokens feed components that reference those roles; an independently overridden component keeps its own value. In dark mode, Persona layers dark defaults and brand, then the explicit light `theme` overrides, then `darkTheme`. Light overrides therefore inherit into dark mode unless overridden there. `colorScheme: 'auto'` follows the system preference. Raw CSS strings and token references such as `palette.colors.primary.500` are supported; a reference string is resolved at runtime, not validated as CSS by TypeScript.

## Fresh configuration: style send and stop

```typescript
import { type AgentWidgetConfig } from '@runtypelabs/persona';

const config = {
  apiUrl: '/api/chat',
  theme: {
    components: {
      composer: { send: { background: '#7c3aed', foreground: '#ffffff', padding: '8px 12px' } },
      button: { stop: { background: '#b91c1c', foreground: '#ffffff' } },
    },
  },
} satisfies AgentWidgetConfig;
```

`composer.send` styles the idle send control. Its `size` applies to icon mode; padding supports icon and text modes. The existing `button.stop` group styles the streaming stop state and inherits idle send colors when omitted. Use the same paths under `darkTheme.components` for dark exceptions. Control `borderColor` is a color and `borderWidth` is a CSS length; both are needed for a visible border. Base component `border` tokens such as `header.border` are colors, while `introCard.border` and artifact pane borders are full CSS shorthands such as `'1px solid #ddd'`. See [advanced surface recipes and migration mappings](style-migrations.md#close-clear-submit-and-mic) for voice, approval, tools, questions and artifacts.

## Where does this setting belong?

| Task | Config owner | Example |
| --- | --- | --- |
| Hide welcome / change greeting | `welcome`; other labels in `copy` | `welcome: { variant: 'none' }` |
| Move starters / change their action | `suggestions.starters` | `{ placement: 'below-composer', behavior: 'fill', items: [] }` |
| Style chips, cards or lists | `theme.components.suggestion` | `chip: { foreground: '#292524' }` |
| Enable a feature or select a provider | `features`, `voiceRecognition`, `attachments` | `voiceRecognition.provider` selects speech recognition; `theme.components.voice.recording.indicator` colors its state |
| Compose or mount the widget | `layout`, `launcher` | `launcher.mountMode`, `layout.header` slots |
| Coordinate visual styling | `brand`, `theme`, `darkTheme` | Shared semantic roles, then exact component exceptions |
| Arrange / resize artifacts | `features.artifacts.layout` | Pane geometry and resize behavior; `theme.components.artifact.pane` styles pane chrome |
| Supply custom UI | Render hooks, layout slots, top-level `components` | Functions/implementations require host JavaScript |

Some visual presentation choices remain configuration: welcome variants, suggestion placement/variants, artifact layout, send icon selection and animation timings. Use the documented owner for each task rather than moving content or behavior into theme.

## Mounted updates and clearing an old style

Fresh config supplies inputs once. `widget.update(patch)` changes a mounted widget. Editor backup snapshots describe resolved state. They are different operations.

| Value in a mounted update | Policy |
| --- | --- |
| Omitted key | Retain the existing input |
| Own key with `undefined` | Reset that override; expose theme/brand/default inheritance |
| Array or function | Replace the whole value |
| Ordinary object | Recursively merge |
| Designated object | Replace the whole object |

The ten replacement paths are `headers`, `agent`, `storageAdapter`, top-level `components`, `targetProviders`, `voiceRecognition.provider.custom`, `features.artifacts.display`, `features.streamAnimation.plugins`, `preferences`, and `welcome.icon`. Top-level custom-renderer `components` replaces; `theme.components` recursively merges.

Explicit legacy style fields take precedence over modern component tokens. Clear an old style explicitly when migrating:

```typescript
widget.update({
  launcher: { closeButtonColor: undefined },
  theme: { components: { header: { close: { foreground: '#7c3aed' } } } },
});
```

For welcome content, the rule differs: modern `welcome.*` wins over old welcome copy aliases. The [migration guide](style-migrations.md) explains both rules and parent resets; the [migration lab](https://persona-chat.dev/style-migration.html) demonstrates mixed and cleared overrides while retaining the conversation.

`false`, `[]`, and empty strings can be intentional opinions; do not remove them because they equal a default. Omitting a fresh input is safe. Removing a supplied input because it equals today's default loses intent. JSON drops `undefined`, functions and private origin symbols, so JSON config is not a live reset patch.

## Copying editor configuration

In the [theme configurator](https://persona-chat.dev/theme.html), **Actions → Copy configuration** copies your supplied settings and edits. Open **Advanced → Include default settings** to include Persona’s defaults. **Copy settings as JSON** follows the same defaults checkbox. To import that JSON, select **Widget configuration**; use **Editor backup / raw theme** for existing backups or token trees. **Copy editor backup** retains the version 2 backup format for restoring the editor.

Imported backups, full configurations and older saved configurations have unknown origin. Their supplied fields stay explicit and the editor labels them **Imported configuration**. Re-authoring a smaller configuration is a deliberate choice; exports do not migrate aliases or guess which supplied values were once defaults. A copied authored configuration is fresh setup, not a reset patch.

For headless editors, `state.exportAuthoredConfig()` returns `{ config, origin }`. It preserves functions in memory; it adds no private origin symbols or history metadata to `config`. `generateCodeSnippet(config, format, { authoredOverrides: true })` emits supplied serializable settings without filling defaults. Existing generator behavior and `exportSnapshot()` remain available. JSON and the installer cannot carry functions. JavaScript formats can emit supported self-contained hooks through `options.hooks`; generated notes identify omitted functions/custom implementations. Reattach callbacks/renderers in host code. Closures cannot be reconstructed from copied code.
