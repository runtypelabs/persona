/** One controller per transcript; streaming morphs retain the delegated listener. */
export function createActivityOverflow(root: HTMLElement) {
  const selector = ".persona-activity-scroll";
  const update = (el: HTMLElement) => {
    const remaining = el.scrollHeight - el.clientHeight;
    const overflow = el.clientHeight > 0 && remaining > 1;
    el.toggleAttribute("data-persona-scroll-top", overflow && el.scrollTop > 1);
    el.toggleAttribute("data-persona-scroll-bottom", overflow && remaining - el.scrollTop > 1);
    el.tabIndex = overflow ? 0 : -1;
  };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(entries => {
    for (const { target } of entries) update(target as HTMLElement);
  });
  const sync = () => {
    observer?.disconnect();
    root.querySelectorAll<HTMLElement>(selector).forEach(el => {
      observer?.observe(el);
      update(el);
    });
  };
  const scroll = (event: Event) => {
    const el = event.target as HTMLElement;
    if (el.matches(selector)) update(el);
  };
  root.addEventListener("scroll", scroll, true);
  return {
    sync,
    destroy() {
      observer?.disconnect();
      root.removeEventListener("scroll", scroll, true);
    },
  };
}
