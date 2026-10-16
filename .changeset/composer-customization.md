---
"@runtypelabs/persona": minor
---

Expand composer customization while preserving existing V4 layouts and explicitly configured controls.

- Adapt single-row and stacked composers to crowded toolbars, mentions, models, and custom slots while keeping Send visible and custom controls focusable. Add independent spacing, mode/model geometry and typography, trailing label icons, and starters below the composer.
- Add space-aware action overflow and themeable menus with configurable width, placement, trigger icons, descriptions, group dividers, and menu-only labels. Managed plugin menus receive safe action invocation, live updates, and cleanup on close.
- Add image/document attachment previews, filename chips, file icon overrides, row layouts, per-kind remove styling, and a managed preview hook. Align mixed previews without stretching remove-button anchors and retain readable remove/retry icons in dark themes.
- Add opt-in dictation transcript/waveform surfaces with cancel, finish, send, and review controls; lifecycle events; and a managed `renderDictation` hook. Preserve drafts, mentions, and attachments, reject stale callbacks, and keep short transcripts and recording controls on one row when space permits. Optional voice bars respond to live input levels and reduced-motion preferences.
- Add accessible tooltips for icon-only actions, with custom text and opt-out. Use a 400ms hover delay while retaining immediate keyboard-focus feedback, suppress overflow tooltips while the menu is open, and restore configured microphone labels on return to idle.
- Reuse shared icon, tooltip, theme, and popover services across optional UI chunks. Load composer controls, activity rendering, dictation, diagnostics, and CDN request handling separately, and ship artifact/menu styles with their renderers to preserve existing bundle limits.
- Prepare configured renderers, icon data, and styles before revealing the widget. Expose controller readiness, retain the launcher during preparation, and preserve the current UI while a newly enabled renderer loads. Retry failed downloads without showing incomplete controls.
- Show installer loading feedback only after 300ms for embedded surfaces and launcher opens; remove it on completion or failure without shifting the layout.
