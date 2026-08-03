---
"@runtypelabs/persona": patch
---

The artifact pane's rendered/source toggle now appears only for previewable file kinds (HTML, SVG, markdown). Non-previewable files (JSON, CSS, TS, …) have no rendered form, so both toggle states painted the identical source view; the dead control is hidden instead, matching the pane's documented intent. The document-toolbar preset keeps its permanent toggle.
