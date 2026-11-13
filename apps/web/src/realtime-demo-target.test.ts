import { describe, expect, it } from "vitest";
import {
  REALTIME_DEMO_FAKE_API_URL,
  REALTIME_DEMO_FAKE_TOKEN,
  RUNTYPE_API_URL,
  resolveRealtimeDemoTarget,
} from "./realtime-demo-target";

const env = {
  VITE_RUNTYPE_REALTIME_CLIENT_TOKEN: "ct_live_env",
  VITE_RUNTYPE_REALTIME_AGENT_ID: "agent_env",
};
const params = (init: Record<string, string> = {}) => new URLSearchParams(init);

describe("resolveRealtimeDemoTarget", () => {
  it("uses the build env, on the production API unless one is set", () => {
    expect(resolveRealtimeDemoTarget(params(), { ...env, DEV: false })).toEqual({
      apiUrl: RUNTYPE_API_URL,
      clientToken: "ct_live_env",
      agentId: "agent_env",
    });
    expect(
      resolveRealtimeDemoTarget(params(), { ...env, VITE_RUNTYPE_API_URL: "http://localhost:8787" })?.apiUrl
    ).toBe("http://localhost:8787");
  });

  it("lets query parameters override the build env", () => {
    const query = params({ apiUrl: "http://127.0.0.1:9999", clientToken: "ct_query", agentId: "agent_query" });
    expect(resolveRealtimeDemoTarget(query, env)).toEqual({
      apiUrl: "http://127.0.0.1:9999",
      clientToken: "ct_query",
      agentId: "agent_query",
    });
  });

  it("talks to the local fake server on a dev server with no env", () => {
    expect(resolveRealtimeDemoTarget(params(), { DEV: true })).toEqual({
      apiUrl: REALTIME_DEMO_FAKE_API_URL,
      clientToken: REALTIME_DEMO_FAKE_TOKEN,
    });
    expect(resolveRealtimeDemoTarget(params({ clientToken: "ct_fake_e2e" }), { DEV: true })?.apiUrl).toBe(
      REALTIME_DEMO_FAKE_API_URL
    );
  });

  it("has no target in a production build with neither env nor parameters", () => {
    expect(resolveRealtimeDemoTarget(params(), { DEV: false })).toBeNull();
    expect(resolveRealtimeDemoTarget(params({ apiUrl: "http://127.0.0.1:8790" }), {})).toBeNull();
  });
});
