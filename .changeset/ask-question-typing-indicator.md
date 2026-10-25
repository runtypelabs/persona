---
"@runtypelabs/persona": patch
---

Keep the standalone typing indicator visible while an `ask_user_question` call streams its arguments, until a plugin bubble or the built-in answer sheet actually renders the question. Previously the transcript went blank between the model starting the tool call and the question appearing.
