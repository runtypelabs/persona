<!--
Thanks for contributing to Persona! Please fill out the checklist below.
See CONTRIBUTING.md for the full workflow: https://github.com/runtypelabs/persona/blob/main/CONTRIBUTING.md
-->

## What does this PR do?

<!-- A short description of the change and why it's needed. Link any related issue. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Tooling / CI

## Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] Tests pass (`pnpm --filter @runtypelabs/persona test:run`) and I added tests for new behavior
- [ ] **Changeset added if I touched `packages/widget` or `packages/proxy`** (`pnpm changeset`). _Not required for changes only under `examples/`, `docs/`, CI, or tooling_
- [ ] Docs updated if I changed public API or behavior

<!--
Contributing a plugin/theme/adapter as a package instead of a monorepo change?
You don't need a PR here: publish to npm per packages/widget/docs/PUBLISHING-PLUGINS.md.
-->
