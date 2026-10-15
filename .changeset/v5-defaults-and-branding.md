---
"@runtypelabs/persona": minor
---

Extend the opt-in V5 defaults and branding controls while preserving V4 defaults and explicit configuration overrides.

- Add six-field brand configuration for coordinated colors, typography, corners, spacing, and elevation. Preserve explicit theme precedence and support header icon padding for glyphs and images. V5 branding uses accented actions, softly tinted user bubbles, and transparent header icons by default.
- Add expandable error blocks with retry while retaining partial responses. Refine V5 message action visibility and enable artifacts by default through the separate artifact UI bundle; V4 remains opt-in. Preserve explicit artifact settings.
- Add configurable loading text and V5 scrolling follow-ups, with reduced-motion support and suggestion cleanup during new work. Honor suggestion font-weight overrides, allow free horizontal chip scrolling in both defaults modes, and expose clipped/faded edge treatment for V5 composer suggestion strips.
- Add scroll-to-bottom activity glyphs, visibility transitions, unread-count styling, and smooth jumps that track streaming content, cancel on manual input, and honor reduced motion. V5 uses dots, fades, and smooth jumps by default; V4 retains instant jumps. Managed custom glyph renderers receive live state and cleanup.
