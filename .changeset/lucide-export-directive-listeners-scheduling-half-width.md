---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": patch
---

### `@runtypelabs/persona`

- **Export `renderLucideIcon(iconName, size?, color?, strokeWidth?)`** from the public package so custom `ComponentRenderer` authors can reuse the same lucide icons as the widget chrome without re-implementing inline SVG.

```ts
import { renderLucideIcon } from "@runtypelabs/persona";

const clock = renderLucideIcon("clock", 14, "currentColor");
if (clock) container.appendChild(clock);
```

- **Component directives.** Event listeners on custom component renderers (registered via `config.components` and rendered from JSON directives) are preserved across transcript updates. Previously, serializing through `tempContainer.innerHTML` during the morph pass dropped `addEventListener`-attached listeners (e.g. `DynamicForm` submit handlers calling `preventDefault()` could revert to full-page navigation after later messages). Directive bubbles now use stub-and-hydrate like `renderAskUserQuestion`; fingerprint-gated rebuilds avoid wiping mid-stream form input when other messages re-render.

### `@runtypelabs/persona-proxy`

- **Scheduling flow.** Teach `DynamicForm` prompts about `width: "half"` so the AI can pair short related inputs (e.g. Phone + Company, City + Zip) side-by-side instead of stacking every field full-width.
