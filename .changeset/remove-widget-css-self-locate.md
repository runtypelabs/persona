---
"@runtypelabs/persona": patch
---

Remove the dead `new URL("../widget.css", import.meta.url)` stylesheet lookup from widget init. Webpack statically resolves the literal and fails consumer builds (Next.js: "Module not found: Can't resolve '../widget.css'") now that the ES2020 target preserves `import.meta`. The lookup has returned null in every shipped bundle, so removal is behavior-preserving: styles continue to arrive via the installer's injected link tag or an explicit `@runtypelabs/persona/widget.css` import, and shadow roots still clone the installer's head link.
