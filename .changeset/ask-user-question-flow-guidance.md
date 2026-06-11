---
"@runtypelabs/persona-proxy": patch
---

Add "Asking instead of guessing" guidance to the WebMCP calendar and slides flow prompts: when an `ask_user_question` tool is available (e.g. via the widget's `features.askUserQuestion.expose` flag), the copilots now know to offer structured options for genuinely ambiguous requests — conflicting slots and multi-match events in the calendar, theme/content/style-direction forks in the deck editor — and to act directly otherwise.
