/** Focus the live editor on empty composer chrome, preserving host controls. */
export function focusComposerOnBackgroundClick(form: HTMLFormElement, event: Event): void {
  if (event.defaultPrevented) return;
  const interactive = 'button, input, textarea, select, a[href], label, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="combobox"], [tabindex]';
  // The path includes nested icons and open shadow-root controls. Stop at the
  // form: an interactive host outside the composer does not own this click.
  for (const node of event.composedPath()) {
    if (node === form) break;
    if (node instanceof Element && node.matches(interactive)) return;
  }
  // Inline mentions replace the textarea with a contenteditable after building
  // the form; never retain a reference to the detached initial input.
  const editor = form.querySelector<HTMLElement>(
    '[data-persona-composer-input][contenteditable="true"]'
  ) ?? form.querySelector<HTMLTextAreaElement>("textarea[data-persona-composer-input]");
  editor?.focus();
}
