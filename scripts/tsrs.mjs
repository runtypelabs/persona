// Shared tsrs detection for scripts/typecheck.mjs and scripts/lint.mjs.
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsrsManifest = require.resolve("tsrs/package.json");
const requireFromTsrs = createRequire(tsrsManifest);
const { optionalDependencies = {} } = require(tsrsManifest);

// pnpm installs only the @tsrs/* binary package matching this host.
const platformPrefix = `@tsrs/${process.platform}-${process.arch}`;
export const hasTsrsBinary = Object.keys(optionalDependencies).some((name) => {
  if (!name.startsWith(platformPrefix)) return false;
  try {
    requireFromTsrs.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
});

// oxlint runs `<path> headless ...`, so it must point at the `tsrs-lint`
// launcher (which adds `--lint`), not at `tsrs`. tsrs is a root devDependency,
// so its bin shim lives in the root node_modules/.bin; on Windows oxlint needs
// pnpm's .cmd shim rather than the extensionless Node script.
// (Resolve from this script, not tsrsManifest: pnpm symlinks that into .pnpm.)
export const tsrsLintPath = join(
  fileURLToPath(new URL("..", import.meta.url)),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsrs-lint.cmd" : "tsrs-lint",
);
