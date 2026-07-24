---
"@runtypelabs/persona": patch
---

Sync the generated Runtype OpenAPI contract with the unified-only stream spec. The Runtype API removed the legacy `FlowSSEEvent` component (its `step_complete` variant now lives on the unified `ExecutionStreamEvent`), which was breaking the `check:runtype-types` gate. `RuntypeStepCompleteEvent` is now derived from `RuntypeExecutionStreamEvent` with an unchanged shape, and `RuntypeFlowSSEEvent` stays exported as a `@deprecated` alias of `RuntypeExecutionStreamEvent` so existing imports keep working. Prefer `RuntypeExecutionStreamEvent` going forward.
