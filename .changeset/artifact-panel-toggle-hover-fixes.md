---
"@runtypelabs/persona": patch
---

Fix artifact panel toggle rendering and hover/active affordances. The view/source toggle now uses the registered `code-xml` icon (the source button previously rendered empty), is built on `createToggleGroup` with correct `aria-pressed` state styling, and the default-toolbar Close button uses `createLabelButton`. Hover and active states for icon buttons, label buttons, artifact tabs, and the document toolbar now resolve to a visible gray step when the theme's container color equals its surface (true for the default preset). The artifact reference card gained hover and focus-visible styles via a new `persona-artifact-card` class, its Download button uses `createLabelButton`, and card chrome is themeable through the new `components.artifact.card` tokens (`--persona-artifact-card-bg/-border/-radius/-hover-bg/-hover-border`). Clicking the card's Download button no longer also opens the artifact panel.
