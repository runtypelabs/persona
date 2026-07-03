---
"@runtypelabs/persona": minor
---

Composer icon buttons are now themeable and consistent. The attachment (`📎`) and mention ("add context" `@`) buttons previously carried hardcoded inline styles (transparent background, `--persona-primary` icon color, fixed radius, JS hover) and exposed no color/background config. They now render from a shared CSS rule wired to the `components.button.ghost.*` token family:

- New convenience CSS variables `--persona-button-ghost-bg` / `-fg` / `-radius` / `-hover-bg`, driven by `components.button.ghost.{background,foreground,borderRadius,hoverBackground}`. A new `hoverBackground` field was added to `ComponentTokenSet`.
- Both buttons are now restyleable together via `theme.components.button.ghost.*` (or CSS on `.persona-attachment-button` / `.persona-mention-button`) without overriding `--persona-primary` globally. Icon and tooltip text remain per-feature config.
- The runtime attachment button (created when `attachments` is toggled on after mount) now uses the same shared CSS rule instead of duplicating the old inline styles, so it restyles identically to the built-in one.

Layout: the "add context" (`@`) affordance now always sits in the composer's **left** action cluster (alongside the attachment button), never the right cluster with mic + send. Previously, when no attachment button was present, it fell back to anchoring on the mic/send and rendered bottom-right. This aligns it with the secondary-left / primary-right convention used across chat UIs and keeps it clear of the primary send action. Applies to both the full (`buildComposer`) and pill (`buildPillComposer`) layouts.

Visual note: the icon foreground now resolves from `components.button.ghost.foreground` (default `semantic.colors.text`) instead of `--persona-primary`. In the default theme this is imperceptible (both are near-black); in brand-colored themes these secondary icon buttons now render with the neutral text color, aligning them with the voice/mic button rather than tinting them the brand primary.
