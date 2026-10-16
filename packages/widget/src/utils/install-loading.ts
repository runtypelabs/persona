/** Installer feedback must work before widget.css or the main bundle arrives.
 * It occupies no layout space and never replaces the launcher's content. */
export const delayInstallLoading = (target: HTMLElement | null, launcher = false) => {
  let indicator: HTMLElement | undefined;
  const position = target?.style.position ?? "";
  const busy = target?.getAttribute("aria-busy");
  let positioned = false;
  const timer = setTimeout(() => {
    if (!target?.isConnected) return;
    if (getComputedStyle(target).position === "static") {
      target.style.position = "relative";
      positioned = true;
    }
    target.setAttribute("aria-busy", "true");
    indicator = target.ownerDocument.createElement("span");
    indicator.setAttribute("data-persona-loading", "");
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-label", "Loading assistant");
    // Inline geometry keeps the same ring visible even while CSS is loading.
    // The stylesheet only adds motion (and respects reduced-motion settings).
    indicator.style.cssText = `position:absolute;pointer-events:none;box-sizing:border-box;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;${launcher ? "bottom:8px;right:8px" : "top:50%;left:50%;margin:-7px;color:var(--persona-text,currentColor)"}`;
    target.append(indicator);
  }, 300);
  return () => {
    clearTimeout(timer);
    if (!indicator || !target) return;
    indicator.remove();
    if (busy == null) target.removeAttribute("aria-busy");
    else target.setAttribute("aria-busy", busy);
    if (positioned && target.style.position === "relative") target.style.position = position;
  };
};
