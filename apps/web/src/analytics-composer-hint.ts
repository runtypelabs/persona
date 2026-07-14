export type ComposerAttentionHint = {
  engage: () => void;
  destroy: () => void;
};

type ComposerAttentionHintOptions = {
  root: HTMLElement;
  isOpen: () => boolean;
  idleMs?: number;
  durationMs?: number;
};

/**
 * Runs one short attention cue after a genuine idle period. Activity elsewhere
 * on the page restarts the clock; interacting with the composer cancels the cue
 * permanently for this page view.
 */
export function installComposerAttentionHint({
  root,
  isOpen,
  idleMs = 8_000,
  durationMs = 5_200,
}: ComposerAttentionHintOptions): ComposerAttentionHint {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  let hintTimer: number | null = null;
  let cleanupTimer: number | null = null;
  let played = false;
  let engaged = false;

  const clearTimers = (): void => {
    if (hintTimer != null) win.clearTimeout(hintTimer);
    if (cleanupTimer != null) win.clearTimeout(cleanupTimer);
    hintTimer = null;
    cleanupTimer = null;
  };

  const dismiss = (): void => {
    clearTimers();
    root
      .querySelector<HTMLElement>(".persona-pill-composer")
      ?.classList.remove("northstar-composer-hint");
  };

  const engage = (): void => {
    engaged = true;
    dismiss();
  };

  const schedule = (): void => {
    if (
      played ||
      engaged ||
      doc.visibilityState !== "visible" ||
      win.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (hintTimer != null) win.clearTimeout(hintTimer);
    hintTimer = win.setTimeout(() => {
      hintTimer = null;
      const composer = root.querySelector<HTMLElement>(".persona-pill-composer");
      if (!composer || engaged || isOpen()) return;
      played = true;
      composer.classList.add("northstar-composer-hint");
      cleanupTimer = win.setTimeout(() => {
        composer.classList.remove("northstar-composer-hint");
        cleanupTimer = null;
      }, durationMs);
    }, idleMs);
  };

  const handlePageActivity = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && target.closest(".persona-pill-composer")) {
      engage();
      return;
    }
    schedule();
  };

  const handleVisibilityChange = (): void => {
    if (doc.visibilityState === "visible") schedule();
    else dismiss();
  };

  doc.addEventListener("pointerdown", handlePageActivity, { capture: true, passive: true });
  doc.addEventListener("keydown", handlePageActivity, { capture: true });
  doc.addEventListener("scroll", handlePageActivity, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", handleVisibilityChange);
  schedule();

  return {
    engage,
    destroy: () => {
      dismiss();
      doc.removeEventListener("pointerdown", handlePageActivity, true);
      doc.removeEventListener("keydown", handlePageActivity, true);
      doc.removeEventListener("scroll", handlePageActivity, true);
      doc.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}
