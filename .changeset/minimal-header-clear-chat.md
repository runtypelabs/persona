---
"@runtypelabs/persona": patch
---

The minimal header layout now renders the clear chat control, honoring the same config as the default layout (`launcher.clearChat.enabled`, `placement`, styling keys, and `layout.header.showClearChat`). It sits in the trailing cluster before the close button. Minimal-layout embeds that never configured `clearChat.enabled: false` will see the button appear, matching what their config already declared; with conversation history enabled it doubles as the New conversation affordance, which was previously missing from this layout.
