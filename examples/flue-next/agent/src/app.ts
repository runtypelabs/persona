import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { ReleaseAssistant } from "./agents/release-assistant";

const app = new Hono();
app.use("/agents/*", async (context, next) => {
  const token = process.env.FLUE_TOKEN;
  if (!token)
    return context.json(
      { error: "Set FLUE_TOKEN before starting the agent." },
      503
    );
  return bearerAuth({ token })(context, next);
});
app.route("/agents/releases", createAgentRouter(ReleaseAssistant));
export default app;
