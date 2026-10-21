/** Narrow layouts hide the panel after a collapsed toggle; wide layouts hide the toggle. */
export function bindControlsToggle(toggle: HTMLButtonElement) {
  toggle.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", String(toggle.getAttribute("aria-expanded") !== "true"));
  });
}
