## Persona verification

<sub>branch `fix/default-tool-activity-labels` · captured at `866f4358b1 + uncommitted changes (5c5110850d98)` · run `20261021-205300-07daf6` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| tool-calls | ✅ verified | Live V5 default preview measures 28px child rows with 2px vertical padding; parent remains 32px. Browser tests cover the resolved default theme, 44px touch targets, V4 parity, authored heights/padding, multiline growth, and 12 disclosure-scroll cases. Local sample injection needs no network request; SDK streaming is outside this spacing proof. |

### tool-calls

**Compact V5 nested rows with resolved theme**

<img src="./01-tool-calls-compact-v5-nested-rows-with-resolved-theme.gif" alt="Compact V5 nested rows with resolved theme" width="640">

<img src="./01-tool-calls-compact-v5-nested-rows-with-resolved-theme.contact-sheet.png" alt="Compact V5 nested rows with resolved theme" width="640">

[`01-tool-calls-compact-v5-nested-rows-with-resolved-theme.webm`](./01-tool-calls-compact-v5-nested-rows-with-resolved-theme.webm)

**Compact default child rows at 28px**

<img src="./02-tool-calls-compact-default-child-rows-at-28px.png" alt="Compact default child rows at 28px" width="640">

[`02-tool-calls-compact-default-child-rows-at-28px.aria.txt`](./02-tool-calls-compact-default-child-rows-at-28px.aria.txt)

