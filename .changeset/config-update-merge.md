---
"@runtypelabs/persona": minor
---

update() now applies one consistent recursive patch policy across the live controller and the init handle. A key merges recursively only when both the previous value and the patch value are plain objects; otherwise the patch value replaces (arrays, functions, class instances, and boolean/string vs object unions all replace wholesale). A small replace-leaf list also replaces wholesale to avoid corrupt hybrids or stranded keys: headers, agent, storageAdapter, components, targetProviders, voiceRecognition.provider.custom, and features.streamAnimation.plugins. A key passed explicitly with value undefined clears the previous value and resets to its default (or stays unset when no default exists); an omitted key is preserved.

The merge is exposed as a new AgentWidgetConfigPatch type accepted by update() (a loosening from the full config type, so existing calls keep working). This also fixes the init handle passing the raw patch to the controller (a double-merge) and an inconsistent tool-call diff baseline.

Compatibility note: consumers who relied on omitting a nested field to erase sibling values will now see those values preserved. To disable or reset a nested field, set it explicitly (for example to false or to undefined) rather than omitting it.
