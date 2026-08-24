---
"@runtypelabs/persona": patch
---

Shrink the theme token pipeline: the mechanical alias/fallback chains in `themeToCssVariables` now run from a data table through a tiny interpreter, and the default spacing scale is generated from its keys. Pure representation change — a golden parity test locks the full CSS-variable output for default light/dark themes and override fixtures, and the exported `DEFAULT_PALETTE`/`DEFAULT_SEMANTIC`/`DEFAULT_COMPONENTS` objects keep their exact shapes.
