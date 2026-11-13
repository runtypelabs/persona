import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Load a contract fixture (`server/hello`, `client/beat`, `http/chat-202`, ...).
 * `RUNTYPE_SOCKET_FIXTURES_DIR` overrides individual files with the server's.
 */
export function socketFixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(fixturePath(name), "utf8")) as T;
}

/** The file a fixture loads from, for byte-exact comparisons. */
export function fixturePath(name: string): string {
  const override = process.env.RUNTYPE_SOCKET_FIXTURES_DIR;
  const candidates = [
    ...(override ? [join(override, `${name}.json`)] : []),
    join(here, `${name}.json`),
  ];
  const file = candidates.find((path) => existsSync(path));
  if (!file) throw new Error(`Missing socket fixture ${name}`);
  return file;
}
