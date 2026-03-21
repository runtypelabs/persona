---
"@runtypelabs/persona": patch
---

Fix artifact pane **Close** (and mobile backdrop tap) so they call the same hide path as `hideArtifacts()`, including split-desktop layouts. `syncArtifactPane` now resets mobile drawer state when the user dismisses the pane.
