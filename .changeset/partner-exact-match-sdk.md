---
"@runtypelabs/persona": minor
---

- Extend custom `renderComposer` context with `streaming`, `openAttachmentPicker`, optional `models` / `selectedModelId` / `onModelChange`, and `onVoiceToggle` when voice is enabled.
- Ensure attachment file input + previews exist for custom composers when `attachments.enabled` is true.
- Reflect streaming state on the composer footer via `data-persona-composer-streaming` and optional `data-persona-composer-disable-when-streaming` controls.
- Add optional markdown `components.markdown.prose.fontFamily` mapped to `--persona-md-prose-font-family` for `.persona-markdown-bubble`.
- Document artifact pane desktop close behavior on `AgentWidgetArtifactsLayoutConfig`.
- Export `AgentWidgetComposerConfig` from the package entry.
