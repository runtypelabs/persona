---
"@runtypelabs/persona": minor
---

Built-in `ask_user_question` client tool, exposable via a config flag.

- **`features.askUserQuestion.expose: true`** advertises a built-in `ask_user_question` tool definition (model-facing description + JSON schema matching `AskUserQuestionPayload`) to the agent on every dispatch via `clientTools[]` — the same wire surface as WebMCP page tools. No server-side `runtimeTools` declaration needed; the server registers it as a bare-named LOCAL tool and the existing answer-pill sheet / `/resume` round-trip handles the call. Defaults to `false` (flows that already declare the tool server-side would otherwise present it twice), and is ignored when `enabled: false` so the agent is never offered a question tool the widget can't render an answer UI for.
- **Exports** `ASK_USER_QUESTION_CLIENT_TOOL`, `ASK_USER_QUESTION_PARAMETERS_SCHEMA`, and `builtInClientToolsForDispatch` so integrators who prefer the server-side `runtimeTools` declaration can reuse the same description and schema.
- **Fix:** `ClientToolDefinition.origin` is now typed `'webmcp' | 'sdk'` (was `'webmcp' | 'local'`). `'local'` was never accepted by the server's dispatch validation and would have failed the request with a 400.
