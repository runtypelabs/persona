// Lints with oxlint, using tsrs-lint as the type-aware backend with compiler
// diagnostics included (`--type-aware --type-check`). Falls back to plain
// oxlint if no matching tsrs platform binary is installed; `pnpm typecheck`
// still covers type errors there via tsgo. Arguments are passed through.
import { spawnSync } from "node:child_process";
import { hasTsrsBinary, tsrsLintPath } from "./tsrs.mjs";

const args = hasTsrsBinary ? ["--type-aware", "--type-check", ...process.argv.slice(2)] : process.argv.slice(2);
if (!hasTsrsBinary) {
  console.warn(`tsrs has no binary for ${process.platform}-${process.arch}; linting without type information.`);
}

const { status, error } = spawnSync("oxlint", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: hasTsrsBinary
    ? { ...process.env, OXLINT_TSGOLINT_PATH: tsrsLintPath, TSRS_FAST: process.env.TSRS_FAST ?? "1" }
    : process.env,
});
if (error) console.error(`Failed to run oxlint: ${error.message}`);
process.exit(status ?? 1);
