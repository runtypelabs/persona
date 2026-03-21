---
"@runtypelabs/persona": minor
---

Artifact pane: optional `layout.paneBackground`, `layout.panePadding`, and `layout.toolbarPreset` (`document` shows view/source, copy/refresh/close, and hides the tab strip for a single artifact). Theme: `components.markdown.inlineCode`, assistant `message` border/shadow CSS vars (`--persona-message-assistant-shadow`, `--persona-md-inline-code-color`), artifact markdown styling for `.persona-markdown-bubble`. Config: `copy.showWelcomeCard`, `wrapComponentDirectiveInBubble`. Composer: `data-persona-composer-*` hooks on the default footer; rebind refs after `renderComposer` plugins. Optional `composerForm`/`textarea` guards when custom composers omit controls.
