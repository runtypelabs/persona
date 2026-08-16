---
"@runtypelabs/persona": patch
---

Make the Messages list loading skeleton visible on every theme and stop it flashing on fast loads. The skeleton bars fell back to the container color, which many themes resolve to the same value as the view surface, rendering the skeleton invisibly. Bars now fall back to the divider/border chain, and the loading block appears through a 250ms show-delay so loads that resolve sooner render the list directly with no intermediate state.
