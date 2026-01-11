---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": minor
---

Rename travrse to runtype and update API URLs

- Update all references from "travrse" to "runtype" throughout codebase
- Change API endpoint from api.travrse.ai to api.runtype.com
- Update environment variable names (TRAVRSE_API_KEY -> RUNTYPE_API_KEY)
- Update data attribute from data-travrse-token to data-runtype-token
- Update CSS variable names from --travrse-* to --runtype-*
- Rename types TravrseFlowConfig -> RuntypeFlowConfig (with deprecated aliases)

**Breaking Changes:**
- Default API endpoint changed to `api.runtype.com`
- Data attribute changed from `data-travrse-token` to `data-runtype-token`
- CSS variables renamed from `--travrse-*` to `--runtype-*`

**Backwards Compatibility:**
- `TRAVRSE_API_KEY` environment variable is still supported as a fallback
- `TravrseFlowStep` and `TravrseFlowConfig` types are exported as deprecated aliases
