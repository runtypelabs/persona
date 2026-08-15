---
"@runtypelabs/persona": patch
---

Fix the destructive action red in dark Messages surfaces: the delete labels rendered the light-surface error-600 at about 3:1 on dark menus, under the AA floor. Dark schemes now default to a lighter red (about 5:1 on the elevated menu), and a new components.history.dangerForeground token lets hosts tune it; light schemes are unchanged.
