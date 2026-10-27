---
"@runtypelabs/persona": patch
---

Keep ask_user_question bubbles out of grouped tool calls so a pending question is never hidden in a collapsed group, and stop `toolCallDisplay.completedVisibility: "removed"` from removing a question that is still waiting for an answer. Both exemptions apply only when the question renders as a question; with `features.askUserQuestion.enabled: false` it is an ordinary tool card that groups and is removed like any other tool.
