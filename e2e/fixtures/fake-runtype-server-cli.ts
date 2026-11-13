/**
 * Run the fake Runtype client-session server standalone, for the MPA demo
 * pages (`apps/web/realtime-mpa.html`):
 *
 *   node e2e/fixtures/fake-runtype-server-cli.ts [--port 8790] [--no-advertise] [--delay 120]
 *
 * Then open http://localhost:5173/realtime-mpa.html?apiUrl=http://127.0.0.1:8790
 */
import { startFakeRuntypeServer } from "./fake-runtype-server.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const server = await startFakeRuntypeServer({
  port: Number(flag("--port") ?? 8790),
  advertise: !args.includes("--no-advertise"),
  frameDelayMs: Number(flag("--delay") ?? 120),
});
console.log(`fake Runtype API listening on ${server.url}`);
console.log(`open /realtime-mpa.html?apiUrl=${encodeURIComponent(server.url)} on the apps/web dev server`);

const stop = () => void server.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
