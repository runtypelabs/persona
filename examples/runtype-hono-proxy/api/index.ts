import { handle } from "hono/vercel";
import { createRuntypeProxyApp, type ProxyEnv } from "../src/app";

const app = createRuntypeProxyApp(process.env as ProxyEnv);

export const GET = handle(app);
export const POST = handle(app);
export const OPTIONS = handle(app);
