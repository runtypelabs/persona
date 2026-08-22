/**
 * Polite live region owned by the view (loading, deletion, rate limit, removal,
 * identity changes). Chunk-local rather than `utils/live-region.ts` because that
 * helper depends on `widget.css`'s sr-only class and hosts on `document.body`
 * under Shadow DOM; this one is self-contained and lives inside the view root.
 */

export interface HistoryAnnouncer {
  element: HTMLElement;
  announce(message: string): void;
  destroy(): void;
}

export function createHistoryAnnouncer(): HistoryAnnouncer {
  const element = document.createElement("div");
  element.className = "persona-history-sr-only";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  element.setAttribute("data-persona-history-live-region", "");

  // Clear and set must land in separate tasks or an identical repeat is silent.
  let pending: ReturnType<typeof setTimeout> | undefined;

  return {
    element,
    announce(message: string) {
      if (pending !== undefined) clearTimeout(pending);
      element.textContent = "";
      pending = setTimeout(() => {
        pending = undefined;
        element.textContent = message;
      }, 0);
    },
    destroy() {
      if (pending !== undefined) clearTimeout(pending);
      element.remove();
    },
  };
}
