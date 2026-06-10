// Named import (not default) so esbuild tree-shakes the JSON module down to
// the one field we read — a default import inlines the entire package.json
// (~4.8 kB minified) into every bundle.
import { version } from "../package.json";

/**
 * The current version of the @runtypelabs/persona package.
 * This is automatically derived from package.json.
 */
export const VERSION = version;
