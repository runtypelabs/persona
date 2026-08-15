---
"@runtypelabs/persona": patch
---

Make the artifact copy menu actionable without integrator code: a `download` menu item id now triggers the widget's built-in artifact download (real filename/MIME for file artifacts, `<title>.md` otherwise) when no handler is set, and `onDocumentToolbarCopyMenuSelect` can return `false` to fall through to the built-in behavior for any action id. The handler payload now also carries `file` metadata, `suggestedFilename`, `mime`, and the raw download `content`, so custom download/PDF/publish handlers no longer have to re-derive them.
