---
"@runtypelabs/persona": major
---

Handle `agent_await` as a distinct local-tool pause event for agent dispatch, alongside the existing `step_await` for flow dispatch. Both resolve through the same `/resume` path; agent page tools (`origin: "webmcp"`) carry a bare tool name on the wire and are normalized to the `webmcp:`-prefixed form internally, and `awaitedAt` is accepted as the pause timestamp.

This is part of the 4.0 wire-protocol change that gives flow vs. agent awaits distinct event types (`step_await` vs `agent_await`) for observability and debugging. The Runtype API emits `agent_await` for agent dispatch; widgets must be on 4.0+ to render agent-dispatch local-tool pauses.
