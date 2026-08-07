---
"@runtypelabs/persona": minor
---

Installer: a `version` in `window.siteAgentConfig` on the first-party CDN (cdn.runtype.com) now stays first-party and resolves to `/persona/<version>/` instead of silently rerouting all widget assets to jsDelivr — which strict-CSP pages (e.g. Runtype-hosted apps) block with no visible error. On other origins `version` keeps the documented npm-CDN behavior. The installer also logs a `console.warn` whenever resolved assets would load from a different origin than the installer itself (explicit `cssUrl`/`jsUrl` overrides excepted), so CSP-blocked installs are diagnosable from the console.
