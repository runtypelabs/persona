interface ScrollLockState {
  originalOverflow: string;
  originalPosition: string;
  originalTop: string;
  originalWidth: string;
  scrollY: number;
}

let lockCount = 0;
let savedState: ScrollLockState | null = null;

/**
 * Acquire a document-level scroll lock. The page body becomes non-scrollable
 * via `overflow: hidden` with an iOS-safe `position: fixed` pattern that
 * preserves the visual scroll position.
 *
 * Ref-counted: multiple callers can acquire; the lock is only released when
 * all callers have released. Each release call is idempotent.
 *
 * @returns A release function. Call it exactly once per acquisition.
 */
export function acquireScrollLock(doc: Document = document): () => void {
  lockCount++;

  if (lockCount === 1) {
    const body = doc.body;
    const win = doc.defaultView ?? window;
    const scrollY = win.scrollY || doc.documentElement.scrollTop;

    savedState = {
      originalOverflow: body.style.overflow,
      originalPosition: body.style.position,
      originalTop: body.style.top,
      originalWidth: body.style.width,
      scrollY,
    };

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
  }

  let released = false;

  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);

    if (lockCount === 0 && savedState) {
      const body = doc.body;
      const win = doc.defaultView ?? window;
      body.style.overflow = savedState.originalOverflow;
      body.style.position = savedState.originalPosition;
      body.style.top = savedState.originalTop;
      body.style.width = savedState.originalWidth;
      win.scrollTo(0, savedState.scrollY);
      savedState = null;
    }
  };
}
