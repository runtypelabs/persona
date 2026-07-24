// Wide markdown tables must scroll inside their own container, never widen the
// chat column. Tables render from an HTML string with no wrapper, so we wrap
// them in the freshly-built morph container before idiomorph runs: the wrapper
// then exists on both sides of every subsequent diff, so it (and its scroll
// position) survives streaming re-renders.

// Off-edge fade width, themeable via --persona-md-table-scroll-fade (set it to
// 0 to disable the fade). Written as a var() reference, not a resolved px value,
// so a consumer's CSS token wins over this inline style.
const FADE = "var(--persona-md-table-scroll-fade, 24px)";

// Containers that already carry the delegated scroll listener.
const LISTENING = new WeakSet<HTMLElement>();

/**
 * Wrap every unwrapped `<table>` under `root` in a `.persona-table-scroll`
 * horizontal-scroll container. Idempotent: tables already wrapped are skipped.
 */
export function wrapScrollableTables(root: HTMLElement): void {
  const tables = root.querySelectorAll("table");
  tables.forEach((table) => {
    const parent = table.parentElement;
    if (parent?.classList.contains("persona-table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "persona-table-scroll";
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });
}

// Toggle the edge-fade mask for one scroll container based on its position.
function updateFade(el: HTMLElement): void {
  const overflow = el.scrollWidth - el.clientWidth;
  if (overflow <= 1) {
    el.removeAttribute("data-persona-scroll-x");
    return;
  }
  el.setAttribute("data-persona-scroll-x", "");
  // scrollLeft can be negative in RTL; magnitude is what matters for the edges.
  const left = Math.abs(el.scrollLeft);
  el.style.setProperty("--persona-fade-l", left <= 1 ? "0px" : FADE);
  el.style.setProperty("--persona-fade-r", left >= overflow - 1 ? "0px" : FADE);
}

/**
 * Refresh edge-fade state for every table scroll container under `container`,
 * and (once per container) attach the delegated scroll listener that keeps the
 * fades in sync as the user scrolls. Call after each transcript morph.
 */
export function refreshTableScrollFades(container: HTMLElement): void {
  if (!LISTENING.has(container)) {
    LISTENING.add(container);
    // scroll does not bubble, but it does fire in the capture phase, so one
    // ancestor listener catches every table without per-table wiring that
    // idiomorph would strip.
    container.addEventListener(
      "scroll",
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.classList?.contains("persona-table-scroll")) {
          updateFade(target);
        }
      },
      true
    );
  }
  container
    .querySelectorAll<HTMLElement>(".persona-table-scroll")
    .forEach(updateFade);
}
