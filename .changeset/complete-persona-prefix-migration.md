---
"@runtypelabs/persona": major
---

Complete tvw- to persona- CSS prefix migration and fix related bugs

**Fixes:**
- Tool call bubbles now correctly show tool names in flow mode (was reading
  `toolName` but the API sends `name` for flow-mode `tool_start` events)
- Image attachment container now has proper flexbox layout (stale `tvw-flex`
  classes replaced with `persona-flex`)
- Tool and reasoning bubble content areas now receive themed border and
  background colors (CSS selector targeted `.tvw-border-t` but elements
  had class `persona-border-t`)
- Voice recording pulse animation now fires (CSS defined
  `.persona-voice-recording` but JS was adding `tvw-voice-recording`)

**Cleanup:**
- Migrated all remaining `tvw-` prefixed CSS classes and keyframes to
  `persona-` prefix for consistency. Zero `tvw-` references remain in source.
- Removed dead `.tvw-approval-badge-*` CSS rules (never referenced)
- Updated README to reflect `maxTurns`, `AgentToolsConfig`, and removed
  stale `maxIterations`/`stopCondition` documentation

**Known limitation:**
- Context providers configured via `contextProviders` are silently dropped
  in agent mode because the API's dispatch schema does not accept a top-level
  `context` field. This requires an API-side change to resolve.
