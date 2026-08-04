---
"@runtypelabs/persona": minor
---

The transcript, greeting, composer, and suggestion surfaces now default to a centered 768px content column on wide panels, matching the column every surveyed product ships (ChatGPT, Claude, Gemini, Copilot, Perplexity, and the reference libraries all cap between 704 and 896px). `layout.contentMaxWidth` still overrides it, `"none"` restores the previous full-width behavior, and composer-bar mode keeps its own 720px fallback. Launcher-width panels are unaffected because the cap only engages above 768px.

The resolved column is also published as CSS variables on the widget root for plugin-rendered content: `--persona-content-max-width` (tracks `layout.contentMaxWidth`, live-updated) and `--persona-welcome-max-width` (640px welcome column), so `renderWelcome` and `renderComposer` elements can match the layout without config access. The composer status text ("Online") receives the same cap as the composer form, so right-aligned status text lines up with the composer's edge instead of the panel edge.
