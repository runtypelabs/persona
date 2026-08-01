---
"@runtypelabs/persona": patch
---

Fix the hero welcome dismiss animation so it plays to completion.

- The renders that follow a send (the assistant placeholder and every streaming chunk) no longer hide the host out from under the in-flight animation, so the hero fades instead of popping out. A re-show through `clearChat()` cancels the animation first.
- The fade now fills forwards, so the last frame stays at opacity 0 instead of flashing back to full opacity before the host is hidden.
- A reload that restores history containing user messages hides the hero outright rather than showing it and animating it away after hydration.
