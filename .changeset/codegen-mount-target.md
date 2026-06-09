---
"@runtypelabs/persona": minor
---

`generateCodeSnippet` now accepts an optional `target` (CSS selector) in `CodeGeneratorOptions` to control the widget mount point. When omitted it defaults to `body` (unchanged behavior). When provided, ESM / React / manual / advanced formats emit it as the `initAgentWidget({ target })` argument, and `script-installer` serializes it into `data-config` (the installer reads `config.target`). This lets snippet-generating tools (e.g. the Runtype CLI's `persona init --target`) mount into a specific element while still routing through the single `generateCodeSnippet` source of truth.
