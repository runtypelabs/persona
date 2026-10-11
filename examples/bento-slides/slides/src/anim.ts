// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Facade: the animation engine lives in the shared kernel now (kernel/src/
// anim.ts). This path stays alive so slides code (and in-flight branches)
// keeps importing './anim' unchanged — see docs/PLATFORM.md §9.
export * from '../../kernel/src/anim.ts'
