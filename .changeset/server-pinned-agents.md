---
"@runtypelabs/persona-proxy": major
---

Add server-pinned agent dispatch (`agentConfig`/`agentId`) and remove the client-agent passthrough.

`createChatProxyApp()` now supports `agentConfig` and `agentId` for agent-shaped routes built and secured server-side. The old client-agent passthrough — where a browser-supplied `config.agent` was forwarded verbatim to the upstream API on the deployer's key (an open relay) — has been removed: a dispatch that carries a client-supplied `agent` on a non-server-agent route is now rejected with a 400 instead of being relayed. Pin agents server-side with `agentConfig`/`agentId`, or point the widget at a backend authorized to accept a client-supplied agent. The bundled example demos (agent loop, docs assistant, fullscreen assistant) are migrated to server-pinned `agentConfig` routes.
