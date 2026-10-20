/** Reparent the existing host; native moves also preserve browser-owned state. */
export function moveWidgetHost(host: HTMLElement, target: HTMLElement, preserveFocus: boolean): void {
  const doc = host.ownerDocument;
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  const owns = (node: Node | null): boolean => {
    while (node) {
      if (host.contains(node)) return true;
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return false;
  };
  const focused = preserveFocus && owns(active) ? active as HTMLElement : null;
  const input = focused as HTMLInputElement | HTMLTextAreaElement | null;
  const start = input?.selectionStart;
  const end = input?.selectionEnd;
  const direction = input?.selectionDirection;
  const root = focused?.getRootNode() as (ShadowRoot & { getSelection?: () => Selection | null }) | undefined;
  const selection = root?.getSelection?.() ?? doc.getSelection();
  const anchor = selection?.anchorNode;
  const focus = selection?.focusNode;
  const offsets = preserveFocus && owns(anchor ?? null) && owns(focus ?? null)
    ? [selection!.anchorOffset, selection!.focusOffset] : null;

  // Feature detection, rather than a browser/version guess. Both nodes were
  // validated as connected in the same document before reaching this path.
  const nativeTarget = target as HTMLElement & { moveBefore?: (node: Node, before: Node | null) => void };
  if (typeof nativeTarget.moveBefore === "function") nativeTarget.moveBefore(host, null);
  else target.appendChild(host);

  focused?.focus({ preventScroll: true });
  if (input && start != null && end != null) input.setSelectionRange(start, end, direction ?? undefined);
  if (offsets && anchor && focus) selection!.setBaseAndExtent(anchor, offsets[0], focus, offsets[1]);
}
