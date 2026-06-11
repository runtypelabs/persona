---
"@runtypelabs/persona": minor
---

Built-in `suggest_replies` client tool behind `features.suggestReplies.expose`. When exposed, the widget advertises the tool on every dispatch via `clientTools[]`; when the agent calls it, the widget renders the suggestions as tappable quick-reply chips above the composer (reusing the suggestion-chips surface and `suggestionChipsConfig` styling) and immediately auto-resumes the execution — fire-and-forget, no user input awaited. Tapping a chip sends its text verbatim as the user's next message; chips clear once any user message follows them. Exports `SUGGEST_REPLIES_CLIENT_TOOL`, `SUGGEST_REPLIES_PARAMETERS_SCHEMA`, `SUGGEST_REPLIES_TOOL_NAME`, `parseSuggestRepliesPayload`, and `latestAgentSuggestions` for integrators who declare the tool server-side. New DOM events: `persona:suggestReplies:shown` / `persona:suggestReplies:selected`.
