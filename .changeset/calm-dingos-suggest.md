---
"@runtypelabs/persona": minor
---

Add rich, themeable starter and follow-up suggestions under a single `suggestions.*` home, with card, chip, and list variants, welcome/transcript/composer placement, `send` or `fill` click behavior, scroll or wrap overflow, `maxItems` caps, and plugin hooks for transforming data, replacing item UI, and intercepting selection.

`suggestions.followUps.enabled` and `suggestions.followUps.expose` are now the canonical keys for the built-in `suggest_replies` tool. `features.suggestReplies` keeps working as a deprecated alias: resolution is per key with `suggestions.followUps` winning, so adding presentation keys never silently re-enables a disabled feature, and debug mode warns once per key when the two homes disagree. The alias is removed in 5.0.

Starters gained `overflow` and a `placement: "auto"` default that uses the welcome surface when the welcome card renders and the composer otherwise. Explicit `welcome` and `composer` are literal, so a pinned `welcome` with a hidden welcome card renders nothing and warns in debug mode.

`transformSuggestions` hooks now receive resolved suggestions (string shorthand already expanded, effective `behavior` filled in) and may still return the loose shape, which is re-normalized after each hook before `maxItems` applies. The `suggest_replies` parameter schema is a single object type with `label`, `prompt`, and `description` only: `id`, `icon`, `behavior`, and `emphasis` are stripped from agent payloads and belong to the host, which sets them through `transformSuggestions`. The parser stays tolerant of `suggestions: string[]` payloads from older flows.

New `controller.setFollowUpSuggestions(items)` and `controller.clearFollowUpSuggestions()` push follow-ups from host code as an ephemeral overlay with source `"host"`: never added to the transcript, the wire payload, or persistence, cleared on the next user message, latest writer wins against agent payloads, and rendered through the same config, plugin, and DOM-event pipeline even when the tool itself is disabled.
