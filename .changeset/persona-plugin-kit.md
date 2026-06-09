---
"@runtypelabs/persona": minor
---

Add `@runtypelabs/persona/plugin-kit` — an optional, dependency-free subpath of utilities for authoring plugins:

- `injectStyles(target, id, css)` — Shadow-DOM-safe `<style>` injection. Resolves the correct root (the widget's shadow root when shadowed, the document head otherwise), is idempotent across re-renders, and defers correctly when called on an element that mounts after the call. A plain `document.head` `<style>` does not reach elements rendered inside the widget's shadow root; this does. `getStyleRoot(node)` is exported for direct use.
- `createPopover({ anchor, content, ... })` — a floating popover for dropdowns/menus/tooltips: `fixed`-positioned so it overlays the widget and escapes the transcript's scroll clipping, portaled into the anchor's root (shadow-aware), dismissed on outside pointerdown, repositioned on scroll/resize, and auto-closed when the anchor leaves the DOM. Returns a handle with `open`/`close`/`toggle`/`reposition`/`destroy`.
- `isEditableEventTarget(event)` — composed-path check so keyboard shortcuts don't fire while the user types in the composer (works across the shadow boundary).

The bundle is unaffected unless you import the subpath. Both example plugins now consume the kit as worked references: `approval-actions-plugin` (all three helpers) and `ask-horizontal-pills-plugin` (`injectStyles`), which also closes a latent Shadow-DOM styling gap where their `document.head` `<style>` would not reach elements rendered inside the widget's shadow root.
