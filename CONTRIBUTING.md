# Contributing to Persona

Thanks for your interest in contributing!

## Setup

**Requirements:** Node.js 20+, pnpm

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
pnpm test:ui        # browser UI (http://localhost:51204)
```

## Generated API types

The widget's request/response types are generated from Runtype's public OpenAPI
spec into `packages/widget/src/generated/runtype-openapi-contract.ts`, which is
committed to the repo.

`pnpm typecheck` re-fetches the live spec and **fails if the committed contract
is out of date** — so if typecheck reports a contract mismatch (and you didn't
touch the generated file), regenerate it:

```bash
pnpm generate:runtype-types   # fetch spec + rewrite the contract, then commit it
pnpm check:runtype-types      # verify-only (what CI runs)
```

This requires network access to `api.runtype.com`. The fetched spec is cached at
`packages/widget/openapi/*.local.json` (gitignored); only the generated `.ts`
contract is committed.

## Submitting changes

1. Fork the repo and create a branch from `main`.
2. Make your changes and ensure `pnpm lint`, `pnpm typecheck`, and tests all pass.
3. **Create a changeset**: this is required for any change to a published package:
   ```bash
   pnpm changeset
   ```
   Select the affected packages, choose a semver bump type, and write a short description. Commit the generated file in `.changeset/` alongside your code changes.
4. Open a pull request against `main`.

## What needs a changeset

Changes to `packages/widget` or `packages/proxy` need a changeset. Changes to `examples/`, docs, CI, or tooling do not.

## Reporting bugs

Open an issue at https://github.com/runtypelabs/persona/issues. Include a minimal reproduction if possible.
