---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": patch
---

Add built-in HTML sanitization via DOMPurify, enabled by default. Configure with the new `sanitize` option: `true` (default), `false` (disable), or a custom `(html: string) => string` function. Also fixes proxy dev-mode CORS defaults, adds prototype pollution protection in config parsing, and validates image URL schemes to block SVG data URIs and javascript: sources.
