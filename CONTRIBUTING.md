# Contributing to Persona

Thanks for your interest in contributing!

## Setup

**Requirements:** Node.js ≥18.17.0, pnpm

```bash
pnpm install
pnpm dev        # starts proxy (port 43111) + widget demo (port 5173)
```

## Development workflow

```bash
pnpm build          # build both packages
pnpm lint           # lint
pnpm typecheck      # type check

# Tests (from packages/widget)
cd packages/widget
pnpm test:run       # run once
pnpm test           # watch mode
```

## Submitting changes

1. Fork the repo and create a branch from `main`.
2. Make your changes and ensure `pnpm lint`, `pnpm typecheck`, and tests all pass.
3. **Create a changeset** — this is required for any change to a published package:
   ```bash
   pnpm changeset
   ```
   Select the affected packages, choose a semver bump type, and write a short description. Commit the generated file in `.changeset/` alongside your code changes.
4. Open a pull request against `main`.

## What needs a changeset

Changes to `packages/widget` or `packages/proxy` need a changeset. Changes to `examples/`, docs, CI, or tooling do not.

## Reporting bugs

Open an issue at https://github.com/runtypelabs/persona/issues. Include a minimal reproduction if possible.
