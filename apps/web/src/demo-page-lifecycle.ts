/** Keep the mounted demo intact when the browser caches this document for Back. */
export function registerDemoPageLifecycle(options: {
  suspend?: () => void;
  resume?: () => void;
  destroy: () => void;
}): () => void {
  let cached = false;
  const dispose = () => {
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
  };
  const hide = (event: PageTransitionEvent) => {
    if (event.persisted) {
      if (!cached) options.suspend?.();
      cached = true;
    } else {
      dispose();
      options.destroy();
    }
  };
  const show = (event: PageTransitionEvent) => {
    if (!event.persisted || !cached) return;
    cached = false;
    options.resume?.();
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  return dispose;
}
