// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// The kernel document envelope — the ONLY doc fields kernel modules may read.
// Every app's document model (bento/slides, bento/spaces, …) satisfies this
// structurally; the kernel never sees an app's content shape (slides, blocks,
// cells). Keep this interface minimal on purpose: adding a field here is a
// platform decision (docs/PLATFORM.md §9), not a convenience.

/** The envelope every Bento document carries (see docs/PLATFORM.md §3). */
export interface KernelDoc {
  /** Stable uuid minted at creation/load — never regenerated. */
  docId: string
  /** Document title (shown in window titles, save filenames). */
  title: string
}
