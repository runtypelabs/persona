---
"@runtypelabs/persona": minor
---

Context mentions: the "add context" button now opens a **picker** instead of inserting a `@` into the composer.

Previously, clicking the affordance button inserted a literal trigger character (`@`) at the caret to reuse the typed-trigger code path — which left a stray `@` in the input if the menu was dismissed, and looked odd for a button. Since selected mentions become **chips** (not inline text), Persona now follows the chip-model convention used by Cursor / Copilot / Windsurf: the button opens the menu with a **search field** at the top (focused on open) and inserts no character. Type to filter, arrow-keys/click to pick; dismissing leaves the composer text completely untouched.

- The typed-`@` path is unchanged: its query still lives in the textarea and no search field is shown.
- New `contextMentions.searchPlaceholder` option (default `"Search context…"`) customizes the picker's field.
- New CSS hooks: `.persona-mention-search`, `.persona-mention-search-input`, `.persona-mention-search-icon`, and the scrolling `.persona-mention-list` (the menu is now an outer box wrapping a pinned search field + scrolling listbox).
- Host-rendered menus (`renderMentionMenu`) open the picker in browse-and-click mode (no built-in search field); the host owns any filtering UI.
