// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Facade: the charts-lite engine lives in the shared kernel now
// (kernel/src/charts.ts). It reads only {w, h, option}; slides' ChartElement
// satisfies that structurally, so call sites are unchanged.
export * from '../../kernel/src/charts.ts'
