---
"@runtypelabs/persona": minor
---

**Icon registry: explicit named imports + public `renderLucideIcon` export.**

Two changes that ship together:

1. **Public `renderLucideIcon` (and `IconName` type) export.** The widget already used this helper internally for every icon in its chrome (header, composer, launcher, tool/reasoning bubbles, attachment manager, etc.); exposing it lets custom `ComponentRenderer` authors draw the same icons without re-implementing inline SVG.

   ```ts
   import { renderLucideIcon, type IconName } from "@runtypelabs/persona";

   const clock = renderLucideIcon("clock", 14, "currentColor");
   if (clock) container.appendChild(clock);
   ```

2. **Closed icon registry — drops ~400KB from the IIFE bundle.** The previous implementation was `import * as icons from "lucide"` plus a runtime string lookup, which defeated tree-shaking; the script-tag/CDN distribution (`dist/index.global.js`) shipped all 1640 lucide icons. The registry is now a curated set of ~110 named imports covering the widget's internal usage and common UI patterns (forms, status, navigation, commerce, media, files, social, decorative). Names outside the registry return `null` and log a warning. See `packages/widget/docs/icon-registry-shortlist.md` for the full list and the rule for adding more.

**Behavior note for config consumers:** any place where you previously passed an arbitrary lucide icon name string (e.g. `launcher.callToActionIconName`, `sendButton.iconName`, `voiceRecognition.iconName`) now resolves against the closed registry. The default values are unchanged. If you were passing a custom name that isn't on the shortlist, the icon will silently render as null and you'll see a console warning telling you to add it to the registry. The new `IconName` type gives TypeScript users autocomplete and compile-time errors for unknown names.

**Side fix:** `attachment-manager.ts` previously returned `"file-json"` as the icon name for `application/json` attachments — that name doesn't exist in lucide v0.552 and silently failed. Switched to `"file-code"`.
