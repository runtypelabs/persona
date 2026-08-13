---
"@runtypelabs/persona": patch
---

Add `features.history.rail.sections`, declarative navigation sections for the Messages rail. Each section takes an optional title, a placement above the conversation list, below it, or in the footer area, and a list of items with a label, an optional icon (a built-in lucide name, an image URL, or a custom render function, in that order of precedence), an optional badge chip, and an `onSelect` callback. Sections are rail-only: a move into panel presentation removes them and a move back re-renders them. Collapsed, the rows that resolved an icon stay as icon-only squares and everything else in the section hides.
