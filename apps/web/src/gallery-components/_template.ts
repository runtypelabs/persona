/**
 * Gallery component template — copy this file to add your own.
 *
 *   1. Copy to a kebab-case file, e.g. `weather-card.ts`. (The leading
 *      underscore is what keeps this template out of the running demo.)
 *   2. Rename the renderer and the descriptor, and give it a unique `name`.
 *   3. Save. The demo auto-discovers it: a "Try" button appears, and the agent
 *      can emit `{ "component": "<name>", "props": {...} }` to render it.
 *
 * See README.md in this folder for the full guide and conventions (persisting
 * user actions, emitting DOM events, theming).
 */
import type { ComponentRenderer } from "@runtypelabs/persona";

import type { GalleryComponent } from "./types";

/**
 * A renderer receives the agent-supplied `props` and a `context` (the message,
 * the widget config, and an `updateProps` callback) and returns a real DOM
 * node. Anything you can do with the DOM works here: listeners, fetches, etc.
 */
export const MyComponent: ComponentRenderer = (props) => {
  const el = document.createElement("div");
  el.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    background: white;
    max-width: 400px;
    margin: 1rem 0;
  `;
  el.textContent = String(props.title || "Hello from a custom component");
  return el;
};

const myComponent: GalleryComponent = {
  name: "MyComponent",
  label: "My component",
  renderer: MyComponent,
  sample: {
    text: "Preview: a custom component.",
    props: { title: "Hello from a custom component" },
  },
};

export default myComponent;
