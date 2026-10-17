// Isolate groups of entries so Rolldown can release each group's module graphs.
// Limiting concurrent jobs alone still retains all completed builds in one heap.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import configs from "../tsdown.config.ts";

const cli = fileURLToPath(new URL("run.mjs", import.meta.resolve("tsdown")));
for (const name of new Set(configs.map(config => config.name))) {
  const result = spawnSync(process.execPath, [cli, "--filter", name, "--concurrency", "4"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
