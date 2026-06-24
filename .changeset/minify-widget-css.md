---
"@runtypelabs/persona": patch
---

Minify the published `dist/widget.css`. It was previously shipped verbatim with all of its authoring comments, so the stylesheet is now ~43% smaller gzipped (and ~41% smaller brotli) over the wire, with no rule or class-name changes. The hand-authored `src/styles/widget.css` stays the commented source of truth; only the built artifact is minified.
