---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": minor
---

Broadcast the widget version as an `X-Persona-Version` request header. The widget now sends its package version on every outgoing request (chat dispatch, session init, feedback, approve, and resume), and the proxy allows the header through CORS and forwards it upstream to the Runtype API.
