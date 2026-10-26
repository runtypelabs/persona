// Typechecks with tsrs, falling back to tsgo if no matching platform binary
// is installed. Arguments are passed through.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsrsManifest = require.resolve("tsrs/package.json");
const requireFromTsrs = createRequire(tsrsManifest);
const { optionalDependencies = {} } = require(tsrsManifest);

// pnpm installs only the @tsrs/* binary package matching this host.
const platformPrefix = `@tsrs/${process.platform}-${process.arch}`;
const hasTsrsBinary = Object.keys(optionalDependencies).some((name) => {
  if (!name.startsWith(platformPrefix)) return false;
  try {
    requireFromTsrs.resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
});

const bin = hasTsrsBinary ? "tsrs" : "tsgo";
if (!hasTsrsBinary) {
  console.warn(`tsrs has no binary for ${process.platform}-${process.arch}; typechecking with tsgo.`);
}

const { status, error } = spawnSync(bin, process.argv.slice(2), {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (error) console.error(`Failed to run ${bin}: ${error.message}`);
process.exit(status ?? 1);
