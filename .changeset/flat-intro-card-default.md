---
"@runtypelabs/persona": minor
---

The welcome (intro) card now renders flat by default: transparent background and no box shadow, so the greeting reads as plain text on the transcript background. This matches the convention across chat products (plain centered greetings in AI chat UIs, plain header text or a regular bot bubble in support messengers). The previous elevated-card look is still available by setting the `theme.components.introCard.background` and `theme.components.introCard.shadow` tokens.
