---
"@runtypelabs/persona": patch
---

Internal refactor of widget UI assembly. Component construction now flows through a small `components/widget-view.ts` view layer (`createWidgetView` / `resolveLauncher`) that groups the shell, transcript, header, composer, and launcher element references into named regions, while `ui.ts` keeps owning behavior. Composer/header parts also expose stable `data-persona-composer-*` ref attributes so plugin and config-driven replacement no longer depends on brittle compound class selectors. No public API or visual changes.
