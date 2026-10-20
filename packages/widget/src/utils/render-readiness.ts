/** Internal preparation barrier. Loading and rendering stay separate so a
 * renderer can eventually be supplied by a host without changing reveal logic. */
export const createRenderReadiness = (mount: HTMLElement) => {
  let revision = 0;
  let disposed = false;
  let ready = Promise.resolve();
  let cancel = () => {};
  let guard: HTMLStyleElement | undefined;
  const wasInert = mount.inert === true;
  const release = () => {
    guard?.remove();
    guard = undefined;
    mount.removeAttribute("data-persona-preparing");
    mount.inert = wasInert;
  };
  return {
    get ready() { return ready; },
    prepare(pending: Promise<unknown>[], render: () => void, keepVisible = false) {
      const current = ++revision;
      cancel();
      if (!pending.length) {
        render();
        if (current !== revision) return;
        release();
        ready = Promise.resolve();
        return;
      }
      // A local style works before widget.css loads, survives host style
      // resets, and travels with the mount between documents/shadow roots.
      if (!keepVisible && !guard) {
        guard = mount.ownerDocument.createElement("style");
        guard.textContent = "[data-persona-preparing],[data-persona-preparing] *{visibility:hidden!important}";
        mount.append(guard);
      }
      if (!keepVisible) {
        mount.setAttribute("data-persona-preparing", "");
        mount.inert = true;
      }
      const cancelled = new Promise<never>((_, reject) => {
        cancel = () => reject(new Error("Widget destroyed before ready"));
      });
      ready = Promise.race([Promise.all(pending), cancelled]).then(() => {
        if (disposed) throw new Error("Widget destroyed before ready");
        if (current !== revision) return ready;
        render();
        if (current !== revision) return ready;
        release();
      }, (error: unknown) => {
        if (!disposed && current !== revision) return ready;
        throw error;
      });
      // Hosts can await ready and handle rejection. Never reveal partial UI
      // after a failed import; a subsequent preparation retries via loaders.
      void ready.catch(() => {});
    },
    destroy() { disposed = true; ++revision; cancel(); release(); },
  };
};
