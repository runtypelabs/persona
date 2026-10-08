// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Facade: signed self-update lives in the shared kernel now
// (kernel/src/update.ts). App identity (manifest url, manifest `app` id) is
// supplied by configureApp() in main.ts — see docs/PLATFORM.md §6, §9.
export * from '../../kernel/src/update.ts'
