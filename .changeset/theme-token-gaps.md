---
"@runtypelabs/persona": minor
---

New theme tokens closing gaps that previously forced page CSS overrides: `components.scrollbar.{thumb,track}` themes the shared scrollbar appearance (surfacing as `--persona-scrollbar-thumb`/`--persona-scrollbar-track`), `components.introCard.border` puts a full border shorthand on the welcome card (default `none`), `components.composer.borderColor` colors the composer form's border, and `components.markdown.codeBlock.borderRadius` sizes code block corners and now follows `palette.radius.md` by default, so square-corner themes get square code blocks without a separate override. All defaults are pixel-identical to the previous hardcoded values.
