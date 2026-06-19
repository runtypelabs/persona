# Publishing a Persona plugin, theme, or adapter

Built something reusable on top of Persona? Publish it to npm so anyone can
install it. This is
the "contribute back as a package" half of Persona's contribution model. The
other half (small UI components → in-repo gallery) lives in the
[gallery README](../../../apps/web/src/gallery-components/README.md).

If you're still authoring the plugin itself, start with
[PLUGINS.md](./PLUGINS.md). This guide is about *packaging and distribution*.

## Naming convention

Persona follows the same discoverability pattern as ESLint, Vite, and
Docusaurus: a predictable package-name prefix plus npm keywords.

| What you built | Package name | npm keywords |
| --- | --- | --- |
| A widget plugin (`AgentWidgetPlugin`) | `persona-plugin-<name>` | `persona`, `persona-plugin` |
| A registered component | `persona-component-<name>` | `persona`, `persona-component` |
| A theme plugin (`PersonaThemePlugin`) | `persona-theme-<name>` | `persona`, `persona-theme` |
| A backend / SSE adapter | `persona-adapter-<name>` | `persona`, `persona-adapter` |

Scoped packages work too (`@your-org/persona-plugin-<name>`). Keep the
`persona-plugin-` segment so the convention still reads. Always include the broad
`persona` keyword plus the specific one; that pairing is what powers
[npm keyword search](https://www.npmjs.com/search?q=keywords:persona-plugin).

## Peer dependency & externalization

Your package must use the **host application's** copy of `@runtypelabs/persona`,
not bundle its own. Otherwise the plugin and the widget end up with separate
module instances and registries (`pluginRegistry`, `componentRegistry`) won't
match. Two steps, the standard library-plugin setup:

1. **Declare it as a peer dependency** (and a dev dependency so you can build):

   ```jsonc
   {
     "peerDependencies": { "@runtypelabs/persona": ">=4.0.0" },
     "devDependencies": { "@runtypelabs/persona": "^4.1.0" }
   }
   ```

2. **Externalize it in your bundler** so it isn't included in your output. With
   `tsup`:

   ```ts
   // tsup.config.ts
   import { defineConfig } from "tsup";
   export default defineConfig({
     entry: ["src/index.ts"],
     format: ["esm", "cjs"],
     dts: true,
     external: ["@runtypelabs/persona", "@runtypelabs/persona/plugin-kit"],
   });
   ```

The `@runtypelabs/persona/plugin-kit` subpath (and any other subpath you import)
should be externalized the same way.

## Minimal package skeleton

```jsonc
// package.json
{
  "name": "persona-plugin-confetti",
  "version": "0.1.0",
  "description": "Celebrates a completed checkout inside Persona",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "keywords": ["persona", "persona-plugin"],
  "peerDependencies": { "@runtypelabs/persona": ">=4.0.0" },
  "license": "MIT"
}
```

```ts
// src/index.ts
import { type AgentWidgetPlugin } from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

export interface ConfettiOptions {
  trigger?: string;
}

export function createConfettiPlugin(options: ConfettiOptions = {}): AgentWidgetPlugin {
  return {
    id: "confetti",
    renderMessage: ({ message, defaultRenderer }) => {
      const el = defaultRenderer();
      injectStyles(el, "persona-plugin-confetti", CSS);
      // ...your behavior...
      return el;
    },
  };
}

const CSS = `/* scoped styles */`;
```

Consumers then install and register it:

```ts
import { pluginRegistry } from "@runtypelabs/persona";
import { createConfettiPlugin } from "persona-plugin-confetti";

pluginRegistry.register(createConfettiPlugin());
```

> **Export a factory, not a singleton,** when your plugin takes options (the
> `create*Plugin(options)` pattern used by the in-repo examples). A bare object
> is fine for zero-config plugins.

Once it's on npm, accurate package naming and keywords are what make it
discoverable via [npm search](https://www.npmjs.com/search?q=keywords:persona-plugin).
