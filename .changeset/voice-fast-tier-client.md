---
"@runtypelabs/persona": minor
---

Support the Runtype voice fast tier. With WebMCP enabled, a GPT-Live call declares the `client_tools` and `delegation_routed` capabilities, sends the page's tool set as a `client_tools` frame (and again whenever it changes), runs the server's `client_tool_call` through the WebMCP execute path, and answers with `client_tool_result`. The confirm gate is skipped only for tools whose annotations declare `readOnlyHint: true`. A delegation the server answers itself (`delegation_started.route: 'direct'`) is not run through the chat pipeline; its user and assistant turns are written to the chat when it completes. Servers that send neither field see no change.
