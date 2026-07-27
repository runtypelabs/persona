# Display preferences

Persona separates two concerns:

- **Feature configuration** is code-owned. It enables capabilities, registers
  renderers and callbacks, and sets security policy.
- **Display preferences** are JSON-safe user or organization choices. They only
  control how enabled features appear.

Hosts render and store their own settings UI. Persona owns the preference
schema, validation, merge behavior, and artifact resolver.

## Recommended integration

`createFeaturePreferenceStore` owns the parse → patch → merge → apply loop.
Hand `getFeatures()` to the widget and persist `preferences` from `onChange`:

```ts
import { createFeaturePreferenceStore } from "@runtypelabs/persona";

const store = createFeaturePreferenceStore({
  base: {
    artifacts: {
      enabled: true,
      allowedTypes: ["markdown", "component"],
      filePreview: { iframeSandbox: "allow-scripts" },
    },
  },
  layers: [
    { id: "organization", preferences: organizationPreferences },
    { id: "surface", preferences: surfacePreferences },
  ],
  // Stored JSON is untrusted; the store parses it through the allowlist.
  stored: JSON.parse(localStorage.getItem("persona-preferences") ?? "{}"),
  onChange: ({ features, preferences }) => {
    controller.update({ features });
    localStorage.setItem("persona-preferences", JSON.stringify(preferences));
  },
});

controller.update({ features: store.getFeatures() });

// A settings control writes one choice; null resets it.
store.setArtifactDisplay({ type: "mediaType", mediaType: "text/html" }, "inline");
store.setArtifactDisplay({ type: "files" }, null);
```

The underlying primitives (`parseWidgetPreferenceSlice`,
`mergeFeaturePreferences`, `applyFeaturePreferencePatch`,
`applyFeaturePreferences`, `createArtifactDisplayPreferencePatch`) remain
exported for hosts with their own state management; the store is a thin
convenience over them.

Preference layers are ordered from lowest to highest priority. Patches follow
JSON Merge Patch (RFC 7386) semantics: objects merge per key, any other value
replaces, and `null` deletes the stored key. Reset deletes the key instead of
copying the current effective value, so a lower layer or future Persona
default can become visible automatically.

## Artifact display schema

Every mode shows the compact reference in the conversation; the mode names
where the artifact **body** renders by default:

| Mode | Where the body renders |
| --- | --- |
| `collapsed` | Nowhere yet. Only the compact reference shows; the pane opens when the user selects it. |
| `panel` | In the side panel, which opens automatically when the artifact starts. |
| `inline` | Directly in the conversation, without involving the pane. |

`"card"` remains accepted everywhere as a deprecated alias of `"collapsed"`
(the old name described the reference card, which every mode shows, rather
than where the body goes); parsing and resolution canonicalize it.

Rules describe three independent facts about an artifact:

```ts
const preferences: WidgetPreferenceSlice = {
  artifacts: {
    display: {
      default: "collapsed",
      byKind: {
        component: "panel",
      },
      files: {
        default: "inline",
        byMediaType: {
          "text/html": "inline",
          "image/*": "panel",
          "text/csv": "collapsed",
        },
      },
    },
  },
};
```

- `default` applies when no narrower rule matches.
- `byKind` identifies the rendering contract: `markdown` or `component`.
- `files` covers any artifact carrying file metadata. Its `byMediaType` keys
  are exact MIME types (`"text/html"`) or major-type wildcards (`"image/*"`),
  matched case-insensitively and without parameters such as `charset`; an
  exact rule beats a wildcard for the same file.

`artifactType` is the rendering contract, not the user's concept of the
content. A `markdown` artifact may be a plain generated document or a backed
file. A `component` artifact names a UI renderer registered by the host.

`byType` remains accepted as a deprecated compatibility alias for `byKind`.
Runtime parsing normalizes it, and `byKind` wins when both names are present.

### One merge rule: strings replace, objects refine

Every level of `display` accepts either a bare mode string or an object, and
they mean different things when layers merge:

- an **object** refines lower layers per key (`files: { default: "inline" }`
  keeps an organization's MIME exceptions);
- a **string** replaces the whole subtree it names (`files: "inline"` means
  "every file, full stop" and discards lower-layer file exceptions;
  `display: "inline"` replaces all lower display rules).

This is ordinary JSON-merge intuition — overriding a parent key overrides its
children — and it is how a user's blanket choice beats an organization's
narrower rule without a specificity doctrine.

### The producer hint

Artifacts can carry `presentation.preferredMode`, the content-disposition
model: the producer suggests where this specific artifact renders. The hint
beats configured defaults but loses to any explicit `files` or `byKind` rule,
so hosts and users always have the last word. Persona never infers it.

## How a value wins

After the layers merge, Persona tests the resulting rules from most specific
to least specific:

1. exact MIME type (`files.byMediaType["text/html"]`);
2. wildcard MIME type (`files.byMediaType["image/*"]`);
3. the files default (`files.default` or the `files` string form);
4. rendering kind (`byKind`);
5. the artifact's own `presentation.preferredMode` hint;
6. configured `default`;
7. Persona's default (`panel`).

Use the public resolver when a settings or debugging UI needs to explain the
outcome:

```ts
const resolution = store.resolveArtifactDisplay({
  artifactType: "markdown",
  file: { path: "chart.png", mimeType: "image/png" },
});
// {
//   mode: "panel",
//   matchedBy: { type: "mediaType", mediaType: "image/png", selector: "image/*" },
//   source: { type: "preference", layerId: "organization" }
// }
```

`matchedBy.selector` is the configured key that matched (useful for writing an
override to exactly the rule that won), and `source` names the preference
layer — or `base`, `artifact` (the producer hint), or `persona` — that
supplied the value. The standalone `resolveArtifactDisplayPreference`,
`resolveArtifactDisplay`, and `resolveArtifactDisplayMode` functions expose
the same resolution without a store.

## Runtime validation and trust boundary

TypeScript types do not validate JSON loaded from a database, local storage,
or an API. The store parses `stored` input automatically; pass other unknown
data through `parseWidgetPreferenceSlice`. It returns the sanitized value plus
issues that a host can log or expose in debugging UI:

```ts
const { preferences, issues } = parseWidgetPreferenceSlice(untrustedJson);
```

`mergeFeaturePreferences`, `applyFeaturePreferencePatch`, and
`applyFeaturePreferences` also parse their inputs defensively. Only the
curated preference keys survive.

Security-sensitive and capability fields are deliberately excluded. Stored
preferences cannot change:

- `artifacts.enabled` or `allowedTypes`;
- `iframeSandbox` or `dangerouslyAllowSameOrigin`;
- callbacks, actions, renderers, labels, or toolbar configuration;
- other feature configuration not present in `WidgetPreferenceSlice`.

Keep those values in the code-owned base feature configuration.

## Product UI guidance

The complete schema is developer plumbing, not a recommended flat settings
screen. Start with recognizable groups:

- **Generated files** maps to the `files` target (writes the string form, so
  the user's choice overrides lower-layer file exceptions).
- **Registered UI components** maps to `byKind.component`.
- **Other artifacts** maps to `default`.

Put MIME rules in a separate **File type exceptions** area and show only types
declared by the host or observed for the current agent. Friendly labels such
as "HTML files" and "Images" are conventional product copy; the control still
writes the stable `text/html` or `image/*` selector underneath.

For each reset option, show the effective fallback rather than a bare
"Inherit." Labels such as "Use default · Side panel" and "Follow files · Collapsed"
explain what deleting the override will do. Resetting the **Generated files**
control deletes only `files.default`, so the user's own MIME exceptions
survive.

## Theme-editor hosts

`@runtypelabs/persona/theme-editor` exports
`STREAM_AND_ARTIFACTS_SUB_GROUP` and
`ARTIFACT_DISPLAY_PREFERENCE_SECTION` for hosts that render Persona's headless
field definitions. Preference fields carry `requiresCapability`, `unsettable`,
and `unsetLabel` metadata. Call `ThemeEditorState.unset(path)` for the reset
action instead of writing a concrete default.

Exact MIME overrides are dynamic and should use
`createArtifactDisplayPreferencePatch` (or `store.setArtifactDisplay`); they
are not represented as fixed theme-editor fields.
