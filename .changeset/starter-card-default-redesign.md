---
"@runtypelabs/persona": minor
---

Redesign the default starter suggestion cards. `emphasis: "primary"` is now a
quiet accent (accent border, faint accent wash, accent icon) instead of a solid
fill, the trailing arrow is revealed on hover and keyboard focus and hidden on
coarse pointers, cards rest without a shadow and gain a shadow plus a 1px lift
on hover, the card grid caps starters at two columns on wide panels, a new set
of suggestions fades up with a 60ms stagger (skipped under
`prefers-reduced-motion`), and the placeholder `suggestionChips` copy is now
verb-first, user-voice, one-line prompts.
