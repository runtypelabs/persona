import "dotenv/config";
import { serve } from "@hono/node-server";
import getPort from "get-port";
import { createRuntypeProxyApp, type ProxyEnv } from "./app.js";

const preferredPort = Number(process.env.PORT ?? 43111);
const env = process.env as ProxyEnv;
const app = createRuntypeProxyApp(env);

const start = async () => {
  const port = await getPort({ port: preferredPort });

  serve({ fetch: app.fetch.bind(app), port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(`▶ runtype-hono-proxy: http://localhost:${info.port}`);
  });
};

start();
