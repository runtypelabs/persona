/**
 * Module-scoped override for the internal history provider (D9). `ui.ts`
 * consults this before constructing the Runtype provider, which lets a demo
 * page mount the in-memory provider without a public config surface.
 *
 * Ships in the bundle (a few lines); the demo provider itself does not.
 */

import type { HistoryProvider } from "./history-provider";

export type HistoryProviderFactory = () => HistoryProvider;

let factory: HistoryProviderFactory | null = null;

/** Pass `null` to fall back to the Runtype provider. */
export function setHistoryProviderFactory(
  next: HistoryProviderFactory | null
): void {
  factory = next;
}

/** Non-destructive: each widget instance builds its own provider. */
export function getHistoryProviderFactory(): HistoryProviderFactory | null {
  return factory;
}
