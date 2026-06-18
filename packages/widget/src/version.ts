// Named import (not default) so esbuild tree-shakes the JSON module down to
// the one field we read: a default import inlines the entire package.json
// (~4.8 kB minified) into every bundle.
import { version } from "../package.json";

/**
 * The current version of the @runtypelabs/persona package.
 * This is automatically derived from package.json.
 */
// TEMP (local unified E2E testing — revert before commit/release): the widget
// must announce major >= 4.0.0 via X-Persona-Version so the Runtype API emits
// the unified 33-event SSE vocabulary the 4.0 widget consumes natively.
// package.json is still version-stamped 3.37.0 until the changeset bump at
// release, which makes this real. `void version` keeps the import lint-clean.
void version;
export const VERSION = "4.0.0";
