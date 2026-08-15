---
"@runtypelabs/persona": patch
---

Wire the history delete-confirmation dialog into the theme system: the destructive button's fill now follows the error palette (error-700 light, error-600 in the built-in dark theme) through an always-emitted --persona-danger / --persona-danger-fg pair instead of a dead variable with a hardcoded fallback, the white label is themable alongside it, and a new components.history.confirm group (dangerBackground, dangerForeground, scrim, shadow) reaches an open dialog on live theme updates.
