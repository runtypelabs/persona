import { createElement } from "./dom";
import { renderLucideIcon } from "./icons";

export interface DropdownMenuItem {
  id: string;
  label: string;
  /** Lucide icon name to show before the label. */
  icon?: string;
  /** When true, item text is styled in a destructive/danger color. */
  destructive?: boolean;
  /** When true, a visual divider is inserted before this item. */
  dividerBefore?: boolean;
}

export interface CreateDropdownOptions {
  /** Menu items to render. */
  items: DropdownMenuItem[];
  /** Called when a menu item is selected. */
  onSelect: (id: string) => void;
  /** Anchor element used for positioning. When `portal` is not set the menu is appended inside this element (which must have position: relative). */
  anchor: HTMLElement;
  /** Alignment of the menu relative to the anchor. Default: 'bottom-left'. */
  position?: 'bottom-left' | 'bottom-right';
  /**
   * Portal target element. When set, the menu is appended to this element
   * and uses fixed positioning calculated from the anchor's bounding rect.
   * Use this to escape `overflow: hidden` containers.
   */
  portal?: HTMLElement;
}

export interface DropdownMenuHandle {
  /** The menu DOM element. */
  element: HTMLElement;
  /** Show the menu. */
  show: () => void;
  /** Hide the menu. */
  hide: () => void;
  /** Toggle visibility. */
  toggle: () => void;
  /** Remove the menu and clean up all listeners. */
  destroy: () => void;
}

/**
 * Create a dropdown menu attached to an anchor element.
 *
 * The menu is styled via `.persona-dropdown-menu` CSS rules and themed
 * through `--persona-dropdown-*` CSS variables with semantic fallbacks.
 *
 * ```ts
 * import { createDropdownMenu } from "@runtypelabs/persona";
 *
 * const dropdown = createDropdownMenu({
 *   items: [
 *     { id: "edit", label: "Edit", icon: "pencil" },
 *     { id: "delete", label: "Delete", icon: "trash-2", destructive: true, dividerBefore: true },
 *   ],
 *   onSelect: (id) => console.log("selected", id),
 *   anchor: buttonElement,
 * });
 * anchor.appendChild(dropdown.element);
 * button.addEventListener("click", () => dropdown.toggle());
 * ```
 */
export function createDropdownMenu(options: CreateDropdownOptions): DropdownMenuHandle {
  const { items, onSelect, anchor, position = 'bottom-left', portal } = options;

  const menu = createElement("div", "persona-dropdown-menu persona-hidden");
  menu.setAttribute("role", "menu");
  menu.setAttribute("data-persona-theme-zone", "dropdown");

  if (portal) {
    // Fixed positioning — menu is portaled outside the anchor's overflow context
    menu.style.position = "fixed";
    menu.style.zIndex = "10000";
  } else {
    // Absolute positioning — menu lives inside the anchor
    menu.style.position = "absolute";
    menu.style.top = "100%";
    menu.style.marginTop = "4px";
    if (position === 'bottom-right') {
      menu.style.right = "0";
    } else {
      menu.style.left = "0";
    }
  }

  // Build menu items
  for (const item of items) {
    if (item.dividerBefore) {
      const hr = document.createElement("hr");
      menu.appendChild(hr);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.setAttribute("data-dropdown-item-id", item.id);
    if (item.destructive) {
      btn.setAttribute("data-destructive", "");
    }

    if (item.icon) {
      const icon = renderLucideIcon(item.icon, 16, "currentColor", 1.5);
      if (icon) btn.appendChild(icon);
    }

    const labelSpan = document.createElement("span");
    labelSpan.textContent = item.label;
    btn.appendChild(labelSpan);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hide();
      onSelect(item.id);
    });

    menu.appendChild(btn);
  }

  let cleanupClickOutside: (() => void) | null = null;

  /** Reposition a portaled menu based on the anchor's current bounding rect. */
  function reposition() {
    if (!portal) return;
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    if (position === 'bottom-right') {
      menu.style.right = `${window.innerWidth - rect.right}px`;
      menu.style.left = "auto";
    } else {
      menu.style.left = `${rect.left}px`;
      menu.style.right = "auto";
    }
  }

  function show() {
    reposition();
    menu.classList.remove("persona-hidden");
    // Defer click-outside listener to avoid catching the triggering click
    requestAnimationFrame(() => {
      const handler = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
          hide();
        }
      };
      document.addEventListener("click", handler, true);
      cleanupClickOutside = () => document.removeEventListener("click", handler, true);
    });
  }

  function hide() {
    menu.classList.add("persona-hidden");
    cleanupClickOutside?.();
    cleanupClickOutside = null;
  }

  function toggle() {
    if (menu.classList.contains("persona-hidden")) {
      show();
    } else {
      hide();
    }
  }

  function destroy() {
    hide();
    menu.remove();
  }

  // Append to portal target or let the caller append manually
  if (portal) {
    portal.appendChild(menu);
  }

  return { element: menu, show, hide, toggle, destroy };
}
