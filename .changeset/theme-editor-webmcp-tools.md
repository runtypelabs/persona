---
"@runtypelabs/persona": minor
---

Add WebMCP tools for the theme editor. `@runtypelabs/persona/theme-editor` now exports `createThemeEditorTools(state)`, a transport-agnostic factory that returns intent-level WebMCP tools (set brand colors, assign color roles, set typography/roundness/color-scheme, apply presets, configure the widget, check WCAG contrast, plus a low-level field escape hatch and session/export controls). Wiring the tools to a `ThemeEditorState` lets a browser agent configure a theme — including a Persona widget styling itself.
