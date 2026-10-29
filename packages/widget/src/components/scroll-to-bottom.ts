import type {
  AgentWidgetConfig,
  AgentWidgetScrollToBottomFeature,
  AgentWidgetScrollToBottomIconContext,
  AgentWidgetScrollToBottomIconHandle,
  AgentWidgetScrollToBottomIconState,
} from "../types";
import { createElement } from "../utils/dom";

/** Shared chrome; custom renderers own only the decorative glyph. */
export function createScrollToBottomControl(
  renderIcon: (name: string, size?: string, color?: string, strokeWidth?: number) => SVGElement | null,
  view: "transcript" | "event-stream",
  focusTarget?: HTMLElement
) {
  const element = createElement("button", "persona-scroll-to-bottom-indicator persona-absolute persona-bottom-3 persona-left-1/2 persona-z-10 persona-text-xs persona-transform persona--translate-x-1/2 persona-cursor-pointer");
  element.type = "button";
  element.setAttribute("data-persona-scroll-to-bottom-visible", "false");
  element.disabled = true;
  element.tabIndex = -1;
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("data-persona-scroll-to-bottom", "true");
  const glyph = createElement("span", "persona-flex persona-items-center persona-justify-center");
  glyph.setAttribute("aria-hidden", "true");
  const label = createElement("span", "");
  const badge = createElement("span", "");
  badge.setAttribute("data-persona-scroll-to-bottom-count", "");
  element.appendChild(glyph);
  element.appendChild(label);
  element.appendChild(badge);
  let config: AgentWidgetConfig = {};
  let state: AgentWidgetScrollToBottomIconState = { activity: "idle", visible: false, hovered: false, focused: false, reducedMotion: false };
  // Keep renderer identity separate from its handle, including null fallbacks.
  let render: AgentWidgetScrollToBottomFeature["renderIcon"];
  let handle: AgentWidgetScrollToBottomIconHandle | undefined;
  let abort: AbortController | undefined;
  let builtin = "";
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;
  // Arrow <-> "Approval needed" pill: one button changing shape, so morph its
  // width and colors on the theme's motion tokens while the new label fades in.
  let morphs: Animation[] = [];
  const paint = () => {
    const style = getComputedStyle(element);
    return { width: `${element.offsetWidth}px`, backgroundColor: style.backgroundColor, borderColor: style.borderColor, color: style.color };
  };
  const morph = (from: Keyframe) => {
    const style = getComputedStyle(element);
    const duration = style.getPropertyValue("--persona-motion-duration-base");
    const timing = { duration: parseFloat(duration) * (duration.includes("ms") ? 1 : 1000) || 200, easing: style.getPropertyValue("--persona-motion-easing").trim() || "ease-out" };
    // Clip only while widening into the pill: the arrow's count badge hangs
    // outside the button.
    const clip = label.style.display === "none" ? null : { overflow: "hidden" };
    morphs = [element.animate([{ ...from, ...clip }, { ...paint(), ...clip }], timing)];
    if (clip) morphs.push(label.animate([{ opacity: 0 }, { opacity: 1 }], timing));
  };
  state.reducedMotion = media?.matches ?? false;
  const warn = (error: unknown) => console.warn("Persona scroll icon failed", error);
  const context = (): AgentWidgetScrollToBottomIconContext => ({ config, state: { ...state }, view, signal: abort!.signal });
  const dispose = () => {
    abort?.abort();
    try { handle?.destroy?.(); } catch (error) { warn(error); }
    handle = undefined;
    abort = undefined;
    glyph.innerHTML = "";
    builtin = "";
  };
  const paintBuiltin = () => {
    if (handle?.element) return;
    const feature = config.features?.scrollToBottom;
    const dots = state.activity === "generating-below" && (feature?.streamingIndicator ?? (config.future?.v5Defaults ? "dots" : "arrow")) === "dots";
    // Same glyph as the approval card it points at, so the two read as one thing.
    const iconName = state.activity === "approval-below" ? "shield-check" : feature?.iconName ?? "arrow-down";
    const key = dots ? "dots" : `arrow:${iconName}`;
    if (builtin === key) return;
    builtin = key;
    glyph.innerHTML = "";
    if (dots) {
      const dotGroup = createElement("span", "persona-scroll-to-bottom-dots");
      for (let i = 0; i < 3; i++) {
        const dot = createElement("span", "");
        dot.style.animationDelay = `${i * 150}ms`;
        dotGroup.appendChild(dot);
      }
      glyph.appendChild(dotGroup);
    } else {
      const icon = renderIcon(iconName, "14px", "currentColor", 2);
      if (icon) glyph.appendChild(icon);
    }
  };
  const updateRenderer = (changed: boolean) => {
    const next = config.features?.scrollToBottom?.enabled === false ? undefined : config.features?.scrollToBottom?.renderIcon;
    if (next !== render) {
      dispose();
      render = next;
      if (render) {
        abort = new AbortController();
        try {
          const result = render(context());
          handle = result && "element" in result ? result : result ? { element: result } : undefined;
          if (handle?.element) glyph.appendChild(handle.element);
        } catch (error) { warn(error); dispose(); }
      }
    } else if (changed && handle?.update) {
      try { handle.update(context()); } catch (error) { warn(error); dispose(); }
    }
    paintBuiltin();
  };
  const stateChanged = (next: AgentWidgetScrollToBottomIconState) =>
    Object.keys(next).some((key) => next[key as keyof typeof next] !== state[key as keyof typeof next]);
  const setState = (next: AgentWidgetScrollToBottomIconState) => {
    const changed = stateChanged(next);
    state = next;
    updateRenderer(changed);
  };
  const hover = () => setState({ ...state, hovered: true });
  const leave = () => setState({ ...state, hovered: false });
  const focus = () => setState({ ...state, focused: true });
  const blur = () => setState({ ...state, focused: false });
  const motion = () => setState({ ...state, reducedMotion: media?.matches ?? false });
  const lifetime = new AbortController();
  for (const [event, listener] of [["mouseenter", hover], ["mouseleave", leave], ["focus", focus], ["blur", blur]] as const) {
    element.addEventListener(event, listener, { signal: lifetime.signal });
  }
  media?.addEventListener?.("change", motion);

  return {
    element,
    /** `approval` marks a pending approval below the fold: the control names it. */
    update(nextConfig: AgentWidgetConfig, visible: boolean, active = false, count = 0, approval = false) {
      const previous = config.features?.scrollToBottom;
      const next = nextConfig.features?.scrollToBottom;
      const configChanged = config.future?.v5Defaults !== nextConfig.future?.v5Defaults ||
        (["enabled", "iconName", "label", "approvalLabel", "streamingIndicator", "transition", "scrollBehavior", "scrollDurationMs"] as (keyof AgentWidgetScrollToBottomFeature)[])
          .some((key) => previous?.[key] !== next?.[key]);
      config = nextConfig;
      const feature = config.features?.scrollToBottom;
      visible = visible && feature?.enabled !== false;
      const ownsFocus = (element.getRootNode() as Document | ShadowRoot).activeElement === element;
      element.setAttribute("data-persona-scroll-to-bottom-visible", String(visible));
      const transition = feature?.enabled === false ? "none" : feature?.transition ?? (config.future?.v5Defaults ? "fade" : "none");
      element.setAttribute("data-persona-scroll-to-bottom-transition", transition);
      if (active && visible) element.setAttribute("data-persona-scroll-to-bottom-streaming", "");
      else element.removeAttribute("data-persona-scroll-to-bottom-streaming");
      element.style.display = !visible && transition === "none" ? "none" : "";
      element.disabled = !visible;
      element.tabIndex = visible ? 0 : -1;
      element.setAttribute("aria-hidden", String(!visible));
      if (!visible && ownsFocus) {
        element.blur();
        if (focusTarget) {
          if (!focusTarget.hasAttribute("tabindex")) focusTarget.tabIndex = -1;
          focusTarget.focus({ preventScroll: true });
        }
      }
      // A waiting approval outranks streaming and the unread count: the turn is
      // blocked on the reader, so the control says so in words.
      const waiting = approval && visible;
      // Morph only a visible control changing shape, never its fade in or out.
      const reshape = state.visible && visible && (state.activity === "approval-below") !== waiting;
      if (reshape || !visible) morphs.forEach((animation) => animation.cancel());
      const from = reshape && !state.reducedMotion && typeof element.animate === "function" ? paint() : null;
      const approvalText = feature?.approvalLabel ?? "Approval needed";
      const text = waiting && approvalText ? approvalText : feature?.label ?? "";
      const base = feature?.label || "Jump to latest";
      element.setAttribute("aria-label", waiting
        ? `${approvalText || "Approval needed"} below. ${base}`
        : `${base}${count > 0 ? ` (${count} new)` : ""}${active && visible ? " (response streaming below)" : ""}`);
      element.title = text;
      element.setAttribute("data-persona-scroll-to-bottom-has-label", String(Boolean(text)));
      if (waiting) element.setAttribute("data-persona-scroll-to-bottom-approval", "");
      else element.removeAttribute("data-persona-scroll-to-bottom-approval");
      label.textContent = text;
      label.style.display = text ? "" : "none";
      const shownCount = waiting ? 0 : count;
      badge.textContent = shownCount > 0 ? String(shownCount) : "";
      badge.style.display = shownCount > 0 ? "" : "none";
      const activity = waiting ? "approval-below" as const : active && visible ? "generating-below" as const : "idle" as const;
      const nextState = { ...state, visible, hovered: visible && state.hovered, focused: visible && state.focused, activity };
      const changed = configChanged || stateChanged(nextState);
      state = nextState;
      updateRenderer(changed);
      if (from) morph(from);
    },
    destroy() {
      morphs.forEach((animation) => animation.cancel());
      dispose();
      lifetime.abort();
      media?.removeEventListener?.("change", motion);
      element.remove();
    },
  };
}
