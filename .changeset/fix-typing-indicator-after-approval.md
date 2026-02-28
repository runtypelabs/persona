---
"@runtypelabs/persona": patch
---

fix(ui): keep typing indicator visible while agent resumes after approval

Exclude approval-variant messages from the hasRecentAssistantResponse check so the typing indicator still shows while the agent resumes after user approval, instead of flickering away.