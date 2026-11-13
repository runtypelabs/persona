import { startServer } from "./server";

const apiKey = process.env.OPENAI_API_KEY || undefined;
const server = await startServer({
  port: Number(process.env.PORT ?? 3140),
  apiKey,
  model: process.env.OPENAI_REALTIME_MODEL || undefined,
});
console.log(
  `▶ openai-realtime-websocket: ${server.url} (${server.fake ? "fake Realtime server, no key" : "OpenAI Realtime"})`
);
