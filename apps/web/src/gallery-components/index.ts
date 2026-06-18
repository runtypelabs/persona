import { componentRegistry } from "@runtypelabs/persona";

import type { GalleryComponent } from "./types";

export type { GalleryComponent } from "./types";

/**
 * Auto-discover every component file in this folder. Vite's `import.meta.glob`
 * statically finds the matching modules at build time, so contributing a new
 * component is just dropping a `my-component.ts` file in here — no edits to this
 * index, the demo, or anywhere else. `index.ts`, `types.ts`, and any
 * underscore-prefixed file (e.g. the `_template.ts` starter) are excluded.
 */
const modules = import.meta.glob<{ default: GalleryComponent }>(
  ["./*.ts", "!./index.ts", "!./types.ts", "!./_*.ts"],
  { eager: true },
);

export const galleryComponents: GalleryComponent[] = Object.values(modules)
  .map((mod) => mod.default)
  .filter(
    (descriptor): descriptor is GalleryComponent =>
      Boolean(descriptor) &&
      typeof descriptor.name === "string" &&
      typeof descriptor.renderer === "function",
  )
  .sort((a, b) => a.label.localeCompare(b.label));

let registered = false;

/**
 * Register every discovered gallery component with Persona's shared
 * `componentRegistry`. Idempotent, so it is safe to call on each mount.
 */
export function registerGalleryComponents(): void {
  if (registered) return;
  for (const component of galleryComponents) {
    componentRegistry.register(component.name, component.renderer);
  }
  registered = true;
}
