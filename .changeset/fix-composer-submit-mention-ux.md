---
"@runtypelabs/persona": patch
---

Fix five composer submit / context-mention UX bugs: guard against double-submit during the async pre-send window, finalize chip and command mention bundles independently so one failing side no longer discards the other, deep-merge cross-bundle mention context per source, stop history recall from opening the mention menu, and rebind the left-action cluster after a plugin replaces the composer so the mention and attachment buttons land in the live footer.
