# Gallery components

Small, self-contained example components that the agent can render inside the
chat as JSON directives. Each file here is meant to be **copied as a starting
point** for your own component — and contributions of new ones are welcome.

These power the "Try other UI" buttons on
[`/dynamic-components.html`](../../dynamic-components.html).

## How it fits together

Persona ships the _mechanism_ for rendering components, not the components
themselves:

1. You write a renderer: `(props, context) => HTMLElement`.
2. You register it by name with the shared registry:
   `componentRegistry.register("MyComponent", MyComponent)`.
3. Your agent returns `{ "component": "MyComponent", "props": { ... } }`, and
   Persona looks the name up in the registry and calls your renderer with the
   props.

This folder wraps that pattern in a tiny convention so the demo can show your
component with zero extra wiring.

## Add a component (≈2 minutes)

1. Copy [`_template.ts`](./_template.ts) to a kebab-case file, e.g.
   `weather-card.ts`.
2. Implement the renderer and fill in the descriptor's `name`, `label`, and a
   `sample` directive.
3. Save. That's it — [`index.ts`](./index.ts) auto-discovers every file in this
   folder via Vite's `import.meta.glob`, registers the renderer, and the demo
   renders a "Try" button from your `sample`. No other files to edit.

Then open the demo, click your button to preview it, or ask the assistant to
show it.

## The descriptor

Every file `export default`s a `GalleryComponent` (see [`types.ts`](./types.ts)):

```ts
import type { GalleryComponent } from "./types";

const myComponent: GalleryComponent = {
  name: "MyComponent", // referenced by the agent: { "component": "MyComponent" }
  label: "My component", // the demo button label
  renderer: MyComponent, // (props, context) => HTMLElement
  sample: {
    text: "Preview: a custom component.",
    props: { title: "Hello" },
  },
};

export default myComponent;
```

## Conventions worth copying

- **Persisting an action.** If your component captures a final user action
  (add-to-cart, vote, submit), persist it with the `userAction` store keyed by
  `context.message.id` so the post-action state survives transcript re-renders
  and reloads. See [`product-card.ts`](./product-card.ts) and
  [`../user-action-store.ts`](../user-action-store.ts).
- **Talking to the host page.** Dispatch a `CustomEvent` (e.g.
  `persona:demo-cart:add`) so the surrounding app can react to what happened
  inside the chat.
- **Forms.** The larger `DynamicForm` example lives in
  [`../components.ts`](../components.ts); it reads `formStyles` / `props.styles`
  for theming. It is intentionally a bigger, fork-it example rather than a
  one-file starter.
