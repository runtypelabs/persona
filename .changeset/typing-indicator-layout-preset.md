---
"@runtypelabs/persona": patch
---

The standalone typing indicator bubble now follows `layout.messages.layout` instead of always painting the `bubble` preset, so it drops its shadow and border in `minimal` and its background in `flat`. It also reads the same `--persona-message-assistant-*` variables as assistant message bubbles, so `theme.components.message.assistant` tokens apply to it.
