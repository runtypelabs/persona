import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

// The eve channel exposes the agent's HTTP API (`/eve/v1/...`) that the Persona
// dispatch route connects to. `none()` keeps this demo keyless: the route can
// reach the agent same-origin in dev and prod with no auth handshake. Before
// deploying anything real, swap `none()` for your provider (Auth.js, Clerk, …)
// or eve's `localDev()` / `vercelOidc()` helpers from `eve/channels/auth`.
export default eveChannel({
  auth: [none()],
});
