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

## Composer attachment previews

Attachment upload and validation remain under `attachments`. Preview options
only change how pending attachments appear in the composer. Existing configurations
keep compact tiles and always-visible overlapping remove buttons.

```typescript
import type { AgentWidgetConfig } from '@runtypelabs/persona';

const config = {
  attachments: {
    enabled: true,
    preview: {
      image: {
        fit: 'cover',
        remove: { visibility: 'always', placement: 'inside' },
      },
      file: {
        layout: 'horizontal',
        name: 'full',
        metadata: 'size',
        badge: 'extension',
        remove: { visibility: 'always', placement: 'inline' },
      },
    },
  },
  composer: { attachmentLayout: 'single-row' },
  theme: {
    components: {
      attachment: {
        composer: {
          image: { width: '112px', height: '112px', borderRadius: '16px' },
          file: { padding: '12px', borderRadius: '12px' },
        },
      },
    },
  },
} satisfies AgentWidgetConfig;
```

| Option | Values |
| --- | --- |
| `preview.image.layout` | `thumbnail` (default), `chip` |
| `preview.image.name` | `hidden` (default), `full`, `basename` (without extension) |
| `preview.image.fit` | `cover` (default), `contain` |
| `preview.file.layout` | `tile` (default), `horizontal`, `vertical` |
| `preview.file.icon` | `true` (default), `false` |
| `preview.file.iconName` | Optional Lucide icon name; omitted uses the file-type icon |
| `preview.file.iconPlacement` | `start` (default), `center` |
| `preview.file.name` | `hidden` (default), `full`, `basename` (without extension) |
| `preview.file.metadata` | `none` (default), `size`, `line-count` |
| `preview.file.badge` | `type` (default), `extension`, `none` |
| `preview.image.remove` / `preview.file.remove` | `visibility: always` (default) or `hover`; `placement: overlap` (default), `inside`, or `inline` |
| `composer.attachmentLayout` | `stacked` (default), `single-row` |

Hover removal also appears on keyboard focus and stays visible on touch devices.
Line counts are optional, computed only for supported text files within a bounded
size; binary documents do not receive guessed line counts. The single-row option
keeps input and controls together below previews when space and draft content permit.
Style these previews through `theme.components.attachment.composer`, with dark
exceptions under `darkTheme.components.attachment.composer`. The existing
`components.attachment.image` tokens retain their separate meaning.

Image chips place the thumbnail, optional name, and inline remove button in a
compact row. `image.width` and `image.height` theme tokens always size the thumbnail;
`image.chip` tokens style the surrounding chip. Full filenames remain available
as tooltips when display names are shortened. File icons can use a Lucide name
such as `file` or `code-xml`; `iconPlacement: 'center'` centers the icon in a vertical
card above its name.

Shared `composer.remove` tokens style both kinds. Set `composer.image.remove` or
`composer.file.remove` for independent overrides; each omitted field inherits the
shared value. For example, an image can use a solid circular remove button while
a file card uses a transparent button with a hover background. These options also
work with the existing custom renderer hook and `defaultRenderer()`.

### Custom attachment preview renderer

Plugins may implement `renderAttachmentPreview(context)`. Like `renderDictation`,
the first non-null result wins. Return `null` to defer to another plugin or the
built-in preview, an `HTMLElement` for a simple preview, or a managed handle for
live progress and cleanup:

```typescript
import type { AgentWidgetPlugin, AttachmentPreviewRenderContext } from '@runtypelabs/persona';

const attachmentCards: AgentWidgetPlugin = {
  id: 'attachment-cards',
  renderAttachmentPreview(context) {
    const element = document.createElement('button');
    element.type = 'button';
    const update = (next: AttachmentPreviewRenderContext) => {
      element.textContent = `${next.state.name} — ${next.state.status}`;
      element.setAttribute('aria-label', `Remove ${next.state.name}`);
    };
    const remove = () => context.actions.remove();
    element.addEventListener('click', remove);
    update(context);
    return {
      element,
      update,
      destroy() { element.removeEventListener('click', remove); },
    };
  },
};
```

The context provides attachment `state`, widget `config`, `instanceId`,
`actions.remove()`, `actions.retry()`, and `defaultRenderer()`. The default renderer
returns a managed handle, so a plugin can delegate to it for selected file types.
A custom card owns its accessibility, labels, and interaction design. Persona
retains validation, upload, cancellation, retry, and message submission. Framework
components can mount into the returned element and unmount in `destroy`.
Use a managed handle to receive state updates without recreating the preview.
Renderer functions belong in host JavaScript; a JSON configuration cannot carry them.

## Mounted updates and clearing an old style

Fresh config supplies inputs once. `widget.update(patch)` changes a mounted widget. Editor backup snapshots describe resolved state. They are different operations.

| Value in a mounted update | Policy |
| --- | --- |
| Omitted key | Retain the existing input |
| Own key with `undefined` | Reset that override; expose theme/brand/default inheritance |
| Array or function | Replace the whole value |
| Ordinary object | Recursively merge |
| Designated object | Replace the whole object |

The following ten paths replace whole objects in mounted updates. Include every member you want to retain; omitted members of the previous object disappear. This table matches the policy in [`config-merge.ts`](../packages/widget/src/utils/config-merge.ts).

| Replacement path | What to supply |
| --- | --- |
| `headers` | The full static header map; `{}` removes all static headers. `getHeaders` remains independent. |
| `agent` | A complete agent definition, including `name`, `model` and `systemPrompt`. Old tools and loop options are not inherited. |
| `storageAdapter` | The complete new persistence adapter in the merged configuration. Optional methods omitted from it are removed; remount to change the active persistence adapter. |
| Top-level `components` | The full host-configured custom-renderer registry; `{}` removes its registrations. Plugin-provided components remain available. `theme.components` recursively merges token objects. |
| `targetProviders` | The full host resolver map; `{}` removes all host registrations. The built-in provider remains available. |
| `voiceRecognition.provider.custom` | A complete voice implementation or factory. Old optional methods are not inherited; sibling provider options merge. This rule applies to this exact path. |
| `features.artifacts.display` | The whole display rule object, including nested selector maps. Sibling artifact options merge. Preference-layer rule resolution is a separate operation. |
| `features.streamAnimation.plugins` | The full plugin map. Sibling animation options merge. |
| `preferences` | The host's complete sparse opinion. Dropped keys revert to base `features`; `{}` expresses no overrides. |
| `welcome.icon` | A complete discriminated icon variant or renderer. Old variant fields and placement are not inherited; sibling welcome fields merge. |

`AgentWidgetConfigPatch` remains a recursive partial for source compatibility; it does not enforce complete replacement objects. Check replacements against their field types with `satisfies`, then pass them to `update()`. To change one field of an agent definition, spread the current complete definition yourself:

```typescript
import type { AgentConfig, AgentWidgetWelcomeIcon } from '@runtypelabs/persona';

declare const currentAgent: AgentConfig;
const agent = { ...currentAgent, systemPrompt: 'Help customers track orders.' } satisfies AgentConfig;
const icon = { type: 'image', url: '/logo.png', alt: 'Support' } satisfies AgentWidgetWelcomeIcon;
widget.update({ agent, welcome: { icon } });
```

For a custom voice replacement, use `satisfies VoiceProvider` on the complete implementation or type its factory as `() => VoiceProvider`. A patch such as `{ agent: { systemPrompt: 'New prompt' } }` still typechecks today but replaces the agent without its required name/model; it is not a safe way to edit an agent. Likewise, an icon patch must include every required field of its chosen variant.

These are configuration merge rules; feature/provider activation follows its own lifecycle. In particular, persistence captures `storageAdapter` at mount time, so an update changes its stored configuration but changing the active adapter requires a remount.

An own `undefined` resets an override at any of these paths. Resetting a parent, such as `{ voiceRecognition: { provider: undefined } }` or `{ welcome: undefined }`, clears its descendants and exposes defaults or resolver fallbacks. Omitted siblings remain unchanged. A boolean/object transition replaces the value; two ordinary objects merge recursively.

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

Design controls use plain-language labels without inline configuration paths. Developers can still search by exact path, inspect exported code, or open **Actions → Advanced → Updating an existing widget?** for the update rules above.

Imported backups, full configurations and older saved configurations have unknown origin. Their supplied fields stay explicit and the editor labels them **Imported configuration**. Re-authoring a smaller configuration is a deliberate choice; exports do not migrate aliases or guess which supplied values were once defaults. A copied authored configuration is fresh setup, not a reset patch.

For headless editors, `state.exportAuthoredConfig()` returns `{ config, origin }`. It preserves functions in memory; it adds no private origin symbols or history metadata to `config`. `generateCodeSnippet(config, format, { authoredOverrides: true })` emits supplied serializable settings without filling defaults. Existing generator behavior and `exportSnapshot()` remain available. JSON and the installer cannot carry functions. JavaScript formats can emit supported self-contained hooks through `options.hooks`; generated notes identify omitted functions/custom implementations. Reattach callbacks/renderers in host code. Closures cannot be reconstructed from copied code.
