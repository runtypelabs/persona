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

## Reasoning layout and details

```typescript
const config = {
  future: { v5Defaults: true },
  features: {
    toolCallDisplay: { layout: 'row' },
    reasoningDisplay: { layout: 'row', appearance: 'inset' },
  },
};
```

Both `layout` controls accept `'row'` or `'card'`. Reasoning `appearance` accepts `'plain'`, `'inset'`, or `'panel'` for its expanded details. V5 defaults to collapsed rows with inset reasoning details; V4 preserves the card panel and plain details when rows are selected. Turn progress defaults to row/inset in either version. A card provides the panel frame itself, without a second nested box. Theme body surfaces and spacing, custom summaries, and manual disclosure choices continue to apply during live updates. The existing `expansion` and `expansion.chevron` options animate every appearance.

V5 expanded reasoning uses 14px text with a 1.55 line height. Expanded reasoning and each tool Request/Response default to a 240px inner scroll cap with 12px edge fades. Set `theme.components.activity.overflow: { maxHeight: '360px', fadeHeight: '16px' }` to customize both kinds. Override either property independently in `theme.components.reasoningBubble.overflow` or `theme.components.toolBubble.overflow`; a per-kind property wins over the corresponding shared property. Tool Request and Response have separate scroll positions. Use `maxHeight: 'none'` for unlimited height or `fadeHeight: '0px'` to disable fades. Fades appear only where content remains out of view, leaving labels, copy buttons, panel frames, and keyboard focus outlines clear. Controls update existing history live; reset a property to `undefined` to inherit again. V4 retains uncapped reasoning and its legacy tool cap without fades unless themed.

`features.reasoningDisplay.maxHeight` remains an explicit compatibility override: a supplied CSS length or `'none'` wins over shared and per-reasoning theme caps. Leave it unset (or reset it to `undefined`) to inherit the theme. Typography is controlled by `theme.components.activity.bodySize` and `bodyLineHeight`; scrolling remains inside the disclosure animation boundary.

`variant` remains a deprecated alias for `layout` because it shipped in Persona 4.24.0. An explicit `layout` wins; resetting it to `undefined` falls back to an authored `variant` and then the version default. Both layout controls and reasoning appearance can also be persisted through `preferences`.

Customize tool Request/Response surfaces and row reasoning with `appearance: 'panel'`
through `theme.components.activity.panel`. Its `background`, `borderColor`,
`borderWidth`, `borderRadius`, and `padding` properties are individually overridden
by `toolBubble.panel` and `reasoningBubble.panel`. Unspecified properties keep
the shared value, then the existing subtle fill, borderless `8px` corners and
`10px 12px` padding. A border color alone keeps width `0`; provide a width to
show it. Plain/inset reasoning and outer card frames keep their independent
styles. Existing `bodySurface` remains a fallback below explicit panel fills.
Legacy tool-call code-block overrides, then authored `toolBubble.codeBlock`
colors, keep precedence over panel colors; an old code-block border color still
implies a `1px` border. See the [panel examples and complete precedence](../packages/widget/THEME-CONFIG.md#v5-tool-details).

Panel theme updates apply to rendered history without another request. Set a
component panel or property to `undefined` to inherit the shared panel again;
clear the shared panel to restore defaults.

## Group tool activity without extra nesting

```typescript
const config = {
  features: {
    toolCallDisplay: {
      grouped: true,
      groupedMode: 'collapsible',
      groupBoundary: 'iteration',
    },
  },
};
```

A single tool appears directly, so one click opens its details. Multiple tools share a group header. Iteration boundaries still apply when single tools have no group wrapper. If an open tool gains a sibling, its new group starts open; later updates respect manual group toggles.

Summary mode always retains its consolidated summary, including one tool. Summary callbacks run only for rendered group headers, but `isLatestGroup` considers every logical group, including unwrapped single tools.

## Optional whole-turn activity

```typescript
import type { AgentWidgetConfig } from '@runtypelabs/persona';

const config: AgentWidgetConfig = {
  turnActivity: { enabled: true },
};
```

This creates one open **Working** disclosure across progress prose and tool batches. Completion collapses it to **Worked**, **Stopped**, or **Failed**. A manual open/close choice survives later updates and completion. Explicit final messages stay outside, including while their text streams. Built-in progress prose uses plain text without message action toolbars; partial and final answers keep normal message actions outside. Classified tools and reasoning use compact rows with details on expansion, and adjacent tools form collapsible semantic summaries by default in both V4 and V5; singleton tools remain direct. Authored display/grouping choices, custom message/tool renderers, themes, and activity spacing tokens still apply. Turning the feature off restores the ordinary presentation without resending a request. Approval controls stay visible while paused; a terminal cancellation/failure ends the waiting state. Expansion motion, reduced motion and shared loading-label settings are reused.

Whole-turn bodies leave 16px below the Working/Worked divider and between prose and tool batches. Expanded tool groups use 2px around and between compact 28px child rows. Authored `theme.components.activity.transcriptGap`, `bodyPadding`, `groupGap`, `groupPadding`, and `rowHeight` override these scoped defaults; ordinary activity rows keep their existing spacing.

Activity rows recognize exact common tool names, such as `web_search`, `Read`, `Bash`, and `apply_patch`, and use labels such as “Searched the web,” “Read a file,” or “Ran a command.” Homogeneous batches use a counted category such as “Web searches (5)” or “File reads (2),” so their headers differ from individual calls. Mixed batches combine repeated categories in their original order, such as “Read files, ran commands,” and shorten long lists while retaining failure, interruption, and approval indicators. Unknown or ambiguous names receive a readable generic label; Persona does not infer a tool's purpose from its arguments. Existing `toolCall.renderCollapsedSummary`, `toolCall.renderGroupedSummary`, and text templates override the defaults. Raw tool names are hidden above expanded details by default; enable `features.toolCallDisplay.showToolName` for a developer-facing name line. This setting is independent of header labels and applies to both rows and cards, including V4. Legacy card stack/summary groups retain their tool-count labels.

`features.toolCallDisplay.durationDisplay` defaults to `"none"`. Use `"tools"`, `"group"`, or `"all"` for compact header timing on tool rows, V5 cards, and collapsible group headers. Sub-second and unknown times are omitted. Expanded details have no automatic duration footer in either version. V4 card default summaries retain their legacy “Used tool for…” wording; custom templates and summary hooks keep their timing behavior. Whole-turn activity timing is independent of this setting.

Custom renderers still receive the original `toolCall.duration`, `durationMs`, `startedAt`, and `completedAt` data. `toolCall.renderCollapsedSummary` also receives `elapsed` and `createElapsedElement()`; `renderGroupedSummary` receives the original `toolCalls` array. Use these to author precise diagnostic timing without a built-in detail footer.


Tool titles work independently of turn activity. Supply a plain-text `toolCall.actionTitle` on the tool call, or use the synchronous `config.toolCall.resolveActionTitle(toolCall, message)` hook. A nonblank direct title takes precedence over the resolver; absent or blank titles fall back to the mapped tool label. Active individual rows show the resolved title. Card headers retain their normal presentation, while `renderCollapsedSummary` receives an optional `context.actionTitle` for custom rendering. Persona does not extract titles from tool arguments, and the native SSE tool schema is unchanged.

`features.toolCallDisplay.groupSummary` controls grouped labels across collapsible, summary-only, and stack modes:

- `"current-action"`: when exactly one tool is active, show its resolved title or safe mapped label. Parallel active tools and completed batches retain aggregate summaries.
- `"aggregate"`: retain the batch summary while tools run.

When omitted, classified turn progress uses current-action for collapsible and summary-only groups; stack mode and ordinary groups use aggregate. Explicit configuration and stored preferences override those defaults. Stack children already show their individual active titles. Approval, error and interruption attention wins over current-action labels. Custom summary callbacks receive the resolved `defaultSummary`; returning null or undefined uses it. Custom summaries and active text templates retain precedence.

```ts
const config = {
  features: { toolCallDisplay: { groupSummary: 'current-action' } },
  toolCall: {
    resolveActionTitle: (tool) => titlesByCallId.get(tool.id),
  },
};
```

Native Persona SSE supports an optional `phase: 'commentary' | 'partial_answer' | 'final_answer'` on `text_start`. With a stable `executionId`, commentary enters activity; partial and final answers stay outside. Tool and reasoning events from the same execution also enter activity. Phase describes placement, not completion: only the run lifecycle settles the disclosure. Unclassified text streams normally, without buffering or later relocation. Visible outside messages split activity into separate spans so later progress never moves ahead of an answer.

For other transports, supply `message.turnActivity: { id, kind: 'progress' | 'final', startedAt?, completedAt?, outcome? }`, or return that shape from a pure synchronous `resolveMessage(message)`. Precedence is direct metadata, a defined resolver result, then native metadata. Use an id unique to the whole response across iterations and reconnects; per-iteration `turnId` may be too narrow. Host-authored teammate updates can be classified progress messages using existing message renderers; Persona does not discover or synthesize subagent activity.

Completed tools inside enabled, classified turn activity use muted semantic icons: globe for web search, document for file reads, pencil for edits, terminal for commands, and database for queries. Exact known tool names determine the category; unknown tools and mixed-category groups use a neutral activity icon. Homogeneous groups share their children's icon. Running, failed, interrupted and approval states retain their status icons. Ordinary rows retain their existing check by default.

Set `toolCall.iconName` to a registered icon name or a synchronous `(toolCall) => string | undefined` callback to override completed row icons per tool. A fixed string also overrides mixed-group icons; per-tool callbacks keep mixed categories neutral. Returning `undefined` keeps the default. Register custom icon data with the public `registerIcons()` API before rendering. The callback receives each original tool, never a synthetic group, and does not own the summary DOM. An unregistered name warns and falls back to the neutral activity icon. Explicit `"check"` retains its success color; other completion icons inherit the label color. `features.toolCallDisplay.iconVisibility` and `groupIconVisibility` still control visibility, including `"active"` and `"never"`.

```ts
registerIcons({ 'order-lookup': [['path', { d: 'M4 6h16M4 12h16M4 18h16' }]] });
const config = {
  turnActivity: { enabled: true },
  toolCall: {
    iconName: (tool) => tool.name === 'lookup_order' ? 'order-lookup' : undefined,
  },
};
```


The [OpenAI Responses example](../examples/ai-sdk-next) preserves provider item identities and phase supplied before text begins. A phase received only at completion is retained as `agentMetadata.providerPhase` for subsequent provider requests; it does not change the displayed message's original placement. `agentMetadata.phase` records the early phase. An adapter must forward these fields explicitly. Providers and models that omit phase remain ordinary streaming chat, with tool/reasoning activity still available. No heuristic classifies arbitrary prose as progress or an answer.

`startedAt` and `completedAt` are measured Unix milliseconds. The header shows elapsed whole seconds after one second, then minutes/seconds, and keeps ticking through silent tool gaps. Missing/invalid timing produces no duration. Adapters must emit terminal tool statuses separately; whole-turn completion does not rewrite tool execution results. The local run lifecycle supplies a live terminal timestamp and outcome; it does not rewrite stored messages. To reproduce duration/outcome on historical replay, persist direct terminal metadata or reconstruct it deterministically in the resolver. A valid `completedAt` implies successful completion unless `outcome` states otherwise. Historical rows start collapsed and never claim ownership of a later run. Restored durable runs may claim existing messages only for the known resumed `executionId`.

`resolveMessage` must be pure and synchronous. Its results are not persisted; a resolver reading a temporary in-memory map must restore that map when loading history. Native SSE parsing accepts the phase extension above; it does not forward arbitrary custom fields. Custom header strings are plain text. The built-in header owns its live clock; custom header content refreshes on transcript/configuration changes and can manage its own timer. A custom HTMLElement owns its effects and DOM content; callbacks should return fresh declarative content on each render. The header hook receives `id`, `messages`, `active`, `outcome`, `elapsedMs`, `defaultSummary`, and `config`. The optional renderer loads before configured UI reveal, including progress-only configurations with tools/reasoning hidden. Enabling during a live run uses the session's existing run snapshot and does not reactivate historical progress. The feature is disabled by default and code generation reports resolver/header functions as host JavaScript requirements.

## Animate tool and reasoning expansion

```typescript
const config = {
  expansion: {
    animation: 'height', duration: 160, easing: 'ease-out',
    chevron: { collapsed: 'right', expanded: 'down' },
  },
};
```

`expansion` shares disclosure motion across tool cards/rows, collapsible tool groups, and reasoning. Its effective defaults are `animation: 'instant'`, `duration: 160` milliseconds, and `easing: 'ease-out'` in both V4 and V5. `height` animates opening and closing from the current rendered height, including a visible collapsed preview. The header stays in place while the inner content moves down 8 pixels on expansion and up on collapse, fading in sync with the height. With height motion enabled, collapsible groups move as one unit instead of replaying per-child entry animations. Rapid toggles reverse from the current height and content appearance; streamed text keeps updating and grows naturally once open. Initial and restored states render immediately. Reduced motion and a zero duration make transitions instant. Negative durations clamp to zero, non-finite durations use 160, and invalid CSS easing falls back to instant.

`expansion.chevron` controls the arrow direction for tools, groups, and reasoning. Each state accepts `up`, `down`, `left`, or `right`. V5 defaults to right when collapsed and down when expanded; V4 retains down/up. Explicit directions override either default and can be updated live. The lighter chevron rotates with the configured expansion duration and easing in height mode; instant mode and reduced motion switch it immediately.

This setting is independent of `loadingLabel` text effects and loading-icon motion. Manual disclosure preserves the widget's reading/scroll intent. Automatic expansion and delayed collapse use the same animation when enabled by `features.toolCallDisplay` or `features.reasoningDisplay`. A child toggle settles an active parent transition so the parent's height cannot clip the newly opened details. Closing details become inert immediately; focus inside them returns to the disclosure header without scrolling.

Content supplied inside Persona's standard tool/reasoning containers receives the same motion. A renderer that replaces the whole container owns its animation. Live `handle.update({ expansion: { animation: 'height' } })` patches merge normally; changing settings during a transition settles it immediately.

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

## Composer More menus

Enable the existing overflow menu and optionally configure its layout. Omitted
options retain the compact menu above the trigger. Placement is a preference:
Persona flips and constrains the popover to fit the viewport.

```typescript
import type { AgentWidgetConfig } from '@runtypelabs/persona';

const config = {
  composer: {
    actionOverflow: {
      enabled: true,
      includeBuiltIns: ['attachments'],
      menu: {
        width: 'composer', // 'content', 'composer', or a CSS width
        placement: 'below', // 'above' by default
        descriptionLayout: 'inline', // 'stacked' by default
        triggerIconName: 'plus',
        openTriggerIconName: 'x',
        items: {
          'core:attachment': {
            label: 'Add photos & files',
            description: 'Upload from computer',
          },
        },
      },
    },
    actions: [{
      id: 'library', label: 'Open library', description: 'Browse saved files',
      group: 'saved', iconName: 'files', placement: 'start',
      presentation: 'overflow', onSelect: () => console.info('Open your library'),
    }],
  },
  attachments: { enabled: true },
  theme: {
    components: {
      composer: {
        overflowMenu: {
          background: '#303030', foreground: '#eee', borderRadius: '16px',
          padding: '8px', rowPadding: '10px 12px', rowBorderRadius: '12px',
          fontSize: '14px', iconSize: '20px', hoverBackground: '#454545',
          descriptionColor: '#aaa',
        },
      },
    },
  },
} satisfies AgentWidgetConfig;
```

`description` and `group` are optional action fields. Consecutive group changes
insert dividers; they do not reorder actions. `menu.items` overrides labels,
descriptions and groups by final action ID, including built-ins such as
`core:attachment` and plugin-namespaced IDs. Changing a label does not change
which action is executed. Actions still come from the existing composer registry.

### Managed menu content

For a searchable picker, nested panels, or a tool gallery, a plugin can supply
`renderComposerMenu`. The first non-null renderer wins; returning `null` uses the
next plugin or built-in renderer. Return `context.defaultRenderer()` directly to
use the standard rows and their keyboard navigation.

```typescript
import type { AgentWidgetPlugin } from '@runtypelabs/persona';

const customMenu: AgentWidgetPlugin = {
  id: 'custom-menu',
  renderComposerMenu(context) {
    const element = document.createElement('div');
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.textContent = 'Add photos & files';
    element.append(upload);
    let current = context;
    upload.onclick = () => current.actions.openAttachmentPicker();
    const update = (next: typeof context) => {
      current = next;
      upload.disabled = !next.items.some(item =>
        item.id === 'core:attachment' && !item.disabled && !item.busy);
    };
    update(context);
    return {
      element, role: 'dialog', update,
      destroy() { upload.onclick = null; },
    };
  },
};
```

The hook receives frozen snapshots of `config` (the **menu options**, not the
whole widget), composer `state`, and visible menu `items`. `actions.invoke(id)`
checks current visibility, disabled and busy state before activating an existing
action. `openAttachmentPicker()` follows the same checks for the built-in upload
action. `actions.close()` restores focus to the trigger; `requestUpdate()`
refreshes contributions and calls the current renderer's `update` method.

Each opening gets a new renderer and `AbortSignal`. Pass `context.signal` to
application fetches; it aborts before cleanup on close, replacement, or widget
destruction. Release subscriptions and framework mounts in `destroy()`. Late
callbacks should check the signal before changing UI. No remote data loading is
performed by Persona itself.

Persona owns the trigger, outer positioning, theme forwarding, initial focus,
outside dismissal, and focus restoration. Arbitrary content defaults to a
non-modal `dialog`: normal Tab navigation works and leaving the popover dismisses
it. Your renderer owns labels and navigation inside custom content, including
submenus. It can consume Escape to close a nested panel before Escape reaches
the outer popover. Declaring `role: 'menu'` on custom content does **not** add
arrow-key navigation; the renderer must implement that menu interaction model.

The [showcase helper](../apps/web/src/assistant-menu-presets.ts) demonstrates
separate floating submenus with hover, click and keyboard entry, delayed loading,
checkbox selections, disabled options, and Escape/Left return navigation.
These are examples, not built-in submenu APIs or live
product integrations. Existing static menus need no hook.

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
