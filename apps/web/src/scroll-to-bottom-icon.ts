import type { AgentWidgetScrollToBottomIconContext, AgentWidgetScrollToBottomIconHandle } from "@runtypelabs/persona";

/** Application-owned animation. An animation library can use the same lifetime. */
export function renderScrollToBottomIcon(context: AgentWidgetScrollToBottomIconContext): AgentWidgetScrollToBottomIconHandle {
  const element = document.createElement("span");
  element.className = "v5-scroll-custom-icon";
  let animation: Animation | undefined;
  let running = false;
  const stop = () => { animation?.cancel(); animation = undefined; };
  const update = ({ state }: AgentWidgetScrollToBottomIconContext) => {
    const active = state.activity === "generating-below";
    element.textContent = active ? "✦" : "↓";
    const next = active && state.visible && !state.reducedMotion;
    if (next === running) return;
    running = next;
    stop();
    if (running) animation = element.animate(
      [{ opacity: 0.45, transform: "scale(.75)" }, { opacity: 1, transform: "scale(1)" }],
      { duration: 650, iterations: Infinity, direction: "alternate", easing: "ease-in-out" }
    );
  };
  update(context);
  context.signal.addEventListener("abort", stop, { once: true });
  return { element, update, destroy: stop };
}
