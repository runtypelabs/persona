---
"@runtypelabs/persona": patch
---

Composer fixes to existing behavior and documentation.

- Documentation drift corrected: `attachments.buttonIconName` documents its real default (`paperclip`), `buttonTooltipText` documents `Attach file`, `allowedTypes` documents the shipped image plus document MIME defaults, `copy.inputPlaceholder` has one canonical default (`How can I help...`), and `voiceRecognition.enabled` documents that it defaults to true.
- The legacy Web Speech path honors `voiceRecognition.provider.browser.language` and `provider.browser.continuous` instead of hardcoding them, and the composer builder renders the mic for a `custom` voice provider, matching the runtime-created button.
- `renderComposer` arbitration re-runs against the current plugin registry on every composer rebuild, and the right action cluster and send wrapper are rebound after a composer swap, so controls created by a later `update()` land in the live composer instead of a detached subtree.
- `contextMentions` changes passed to `controller.update()` now apply: enabling, disabling, or reconfiguring mentions live previously did nothing.
- The attachment preview strip left-aligns inside a capped composer column: with `layout.contentMaxWidth` engaged, centered composer children now get an explicit width, so the flex-item previews row fills the column instead of shrink-wrapping to one centered tile. `controller.update()` had a divergent copy of this rule that skipped the previews row entirely; both paths now share it.
- The end action cluster uses the same 8px gap as the start cluster (it was 4px), and every composer control draws its focus ring inside its border box from the input focus-ring token instead of falling back to the browser's outward default, so a focused control no longer grows into its neighbor.
- `layout.slots.composer` and `layout.slots.messages` are marked deprecated and unsupported: they have never been implemented, and configuring either now warns in debug mode. The composer textarea and inline editor set `dir="auto"`, and the textarea sets `enterkeyhint` and `autocomplete="off"`.
