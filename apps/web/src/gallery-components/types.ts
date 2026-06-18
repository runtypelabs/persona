import type { ComponentRenderer } from "@runtypelabs/persona";

/**
 * One streamed UI component, contributed as a single self-contained file in
 * this folder. The Dynamic Components demo auto-discovers every descriptor
 * (see `index.ts`), registers its renderer, and renders a "Try" button from
 * the sample below — so adding a component is just dropping a file in here.
 */
export interface GalleryComponent {
  /**
   * Name the agent references in JSON: `{ "component": name, "props": {...} }`.
   * Must be unique across the gallery.
   */
  name: string;
  /** Button label shown in the demo's "Try other UI" group. */
  label: string;
  /** The renderer registered with Persona's `componentRegistry` under `name`. */
  renderer: ComponentRenderer;
  /** Example directive the demo injects when this component's button is clicked. */
  sample: {
    /** Intro line shown in the chat bubble above the rendered component. */
    text: string;
    /** Props passed to the renderer — the same shape the agent would emit. */
    props: Record<string, unknown>;
  };
}
