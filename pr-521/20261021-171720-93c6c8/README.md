## Persona verification

<sub>branch `fix/default-tool-activity-labels` · captured at `fd690c9c20 + uncommitted changes (9fce7bbe89ca)` · run `20261021-171720-93c6c8` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| tool-calls | ✅ verified | V5 preview with Tool grouping set to Default: group reads Searched docs, read files; child rows read Searched docs and Read a file. Preview uses local sample injection, so no network request is expected. Full SDK streaming path is outside this label-only proof. |

### tool-calls

**Default descriptive labels**

<img src="./01-tool-calls-default-descriptive-labels.gif" alt="Default descriptive labels" width="640">

<img src="./01-tool-calls-default-descriptive-labels.contact-sheet.png" alt="Default descriptive labels" width="640">

[`01-tool-calls-default-descriptive-labels.webm`](./01-tool-calls-default-descriptive-labels.webm)

**Default grouped and individual action labels**

<img src="./02-tool-calls-default-grouped-and-individual-action-labels.png" alt="Default grouped and individual action labels" width="640">

[`02-tool-calls-default-grouped-and-individual-action-labels.aria.txt`](./02-tool-calls-default-grouped-and-individual-action-labels.aria.txt)

**Settled default labels**

<img src="./03-tool-calls-settled-default-labels.png" alt="Settled default labels" width="640">

[`03-tool-calls-settled-default-labels.aria.txt`](./03-tool-calls-settled-default-labels.aria.txt)

