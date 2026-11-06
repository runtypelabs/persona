// Typechecks with tsrs, falling back to tsgo if no matching platform binary
// is installed. Arguments are passed through.
import { spawnSync } from "node:child_process";
import { hasTsrsBinary } from "./tsrs.mjs";

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
