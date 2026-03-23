import { createElement } from "./dom";
import { renderLucideIcon } from "./icons";
import { createDropdownMenu, type DropdownMenuItem } from "./dropdown";

// ---------------------------------------------------------------------------
// createIconButton
// ---------------------------------------------------------------------------

/** Options for {@link createIconButton}. */
export interface CreateIconButtonOptions {
  /** Lucide icon name (kebab-case, e.g. "eye", "chevron-down"). */
  icon: string;
  /** Accessible label (used for aria-label and title). */
  label: string;
  /** Icon size in pixels. Default: 16. */
  size?: number;
  /** Icon stroke width. Default: 2. */
  strokeWidth?: number;
  /** Extra CSS class(es) appended after "persona-icon-btn". */
  className?: string;
  /** Click handler. */
  onClick?: (e: MouseEvent) => void;
  /** Additional ARIA attributes (e.g. { "aria-haspopup": "true" }). */
  aria?: Record<string, string>;
}

/**
 * Creates a minimal icon-only button with accessible labelling.
 *
 * The button receives the base class `persona-icon-btn` and renders a single
 * Lucide icon inside it.
 */
export function createIconButton(options: CreateIconButtonOptions): HTMLButtonElement {
  const { icon, label, size, strokeWidth, className, onClick, aria } = options;

  const btn = createElement(
    "button",
    "persona-icon-btn" + (className ? " " + className : ""),
  );
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.title = label;

  const svg = renderLucideIcon(icon, size ?? 16, "currentColor", strokeWidth ?? 2);
  if (svg) {
    btn.appendChild(svg);
  }

  if (onClick) {
    btn.addEventListener("click", onClick);
  }

  if (aria) {
    for (const [key, value] of Object.entries(aria)) {
      btn.setAttribute(key, value);
    }
  }

  return btn;
}

// ---------------------------------------------------------------------------
// createLabelButton
// ---------------------------------------------------------------------------

/** Options for {@link createLabelButton}. */
export interface CreateLabelButtonOptions {
  /** Optional Lucide icon name shown before the label. */
  icon?: string;
  /** Button text label (also used for aria-label). */
  label: string;
  /** Visual variant. Default: "default". */
  variant?: "default" | "primary" | "destructive" | "ghost";
  /** Size preset. Default: "sm". */
  size?: "sm" | "md";
  /** Icon size in pixels. Default: 14. */
  iconSize?: number;
  /** Extra CSS class(es). */
  className?: string;
  /** Click handler. */
  onClick?: (e: MouseEvent) => void;
  /** Additional ARIA attributes. */
  aria?: Record<string, string>;
}

/**
 * Creates a button with an optional leading icon and a text label.
 *
 * CSS classes follow the BEM-like pattern:
 * `persona-label-btn persona-label-btn--{variant} persona-label-btn--{size}`
 */
export function createLabelButton(options: CreateLabelButtonOptions): HTMLButtonElement {
  const {
    icon,
    label,
    variant = "default",
    size = "sm",
    iconSize,
    className,
    onClick,
    aria,
  } = options;

  let classString = "persona-label-btn";
  if (variant !== "default") {
    classString += " persona-label-btn--" + variant;
  }
  classString += " persona-label-btn--" + size;
  if (className) {
    classString += " " + className;
  }

  const btn = createElement("button", classString);
  btn.type = "button";
  btn.setAttribute("aria-label", label);

  if (icon) {
    const svg = renderLucideIcon(icon, iconSize ?? 14, "currentColor", 2);
    if (svg) {
      btn.appendChild(svg);
    }
  }

  const span = createElement("span");
  span.textContent = label;
  btn.appendChild(span);

  if (onClick) {
    btn.addEventListener("click", onClick);
  }

  if (aria) {
    for (const [key, value] of Object.entries(aria)) {
      btn.setAttribute(key, value);
    }
  }

  return btn;
}

// ---------------------------------------------------------------------------
// createToggleGroup
// ---------------------------------------------------------------------------

/** Describes a single item inside a toggle group. */
export interface ToggleGroupItem {
  id: string;
  /** Lucide icon name. If omitted, uses label as text. */
  icon?: string;
  /** Accessible label for the button. */
  label: string;
}

/** Options for {@link createToggleGroup}. */
export interface CreateToggleGroupOptions {
  /** Toggle items. */
  items: ToggleGroupItem[];
  /** Initially selected item id. */
  selectedId: string;
  /** Called when selection changes. */
  onSelect: (id: string) => void;
  /** Extra CSS class(es) on the wrapper. */
  className?: string;
}

/** Handle returned by {@link createToggleGroup}. */
export interface ToggleGroupHandle {
  /** The wrapper element containing toggle buttons. */
  element: HTMLElement;
  /** Programmatically change the selected item. */
  setSelected: (id: string) => void;
}

/**
 * Creates a group of mutually-exclusive toggle buttons.
 *
 * Each button uses `aria-pressed` to communicate its state. Only one button
 * can be active at a time.
 */
export function createToggleGroup(options: CreateToggleGroupOptions): ToggleGroupHandle {
  const { items, selectedId, onSelect, className } = options;

  const wrapper = createElement(
    "div",
    "persona-toggle-group" + (className ? " " + className : ""),
  );
  wrapper.setAttribute("role", "group");

  let currentId = selectedId;
  const buttons: { id: string; btn: HTMLButtonElement }[] = [];

  function updatePressed() {
    for (const entry of buttons) {
      entry.btn.setAttribute("aria-pressed", entry.id === currentId ? "true" : "false");
    }
  }

  for (const item of items) {
    let btn: HTMLButtonElement;

    if (item.icon) {
      btn = createIconButton({
        icon: item.icon,
        label: item.label,
        onClick: () => {
          currentId = item.id;
          updatePressed();
          onSelect(item.id);
        },
      });
    } else {
      btn = createElement("button", "persona-icon-btn");
      btn.type = "button";
      btn.setAttribute("aria-label", item.label);
      btn.title = item.label;
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        currentId = item.id;
        updatePressed();
        onSelect(item.id);
      });
    }

    btn.setAttribute("aria-pressed", item.id === currentId ? "true" : "false");
    buttons.push({ id: item.id, btn });
    wrapper.appendChild(btn);
  }

  function setSelected(id: string) {
    currentId = id;
    updatePressed();
  }

  return { element: wrapper, setSelected };
}

// ---------------------------------------------------------------------------
// createComboButton
// ---------------------------------------------------------------------------

/** Options for {@link createComboButton}. */
export interface CreateComboButtonOptions {
  /** Button text label. */
  label: string;
  /** Lucide icon name for the dropdown indicator (default: "chevron-down"). */
  icon?: string;
  /** Dropdown menu items. */
  menuItems: DropdownMenuItem[];
  /** Called when a menu item is selected. */
  onSelect: (id: string) => void;
  /** Where to align the dropdown. Default: "bottom-left". */
  position?: "bottom-left" | "bottom-right";
  /**
   * Portal target for the dropdown menu. When set, the menu escapes
   * overflow containers by rendering inside this element with fixed positioning.
   */
  portal?: HTMLElement;
  /** Extra CSS class(es) on the wrapper element. */
  className?: string;
  /** Hover style for the pill effect. */
  hover?: {
    background?: string;
    border?: string;
    borderRadius?: string;
    padding?: string;
  };
}

/** Handle returned by {@link createComboButton}. */
export interface ComboButtonHandle {
  /** The wrapper element (label + chevron + dropdown). */
  element: HTMLElement;
  /** Update the displayed label text. */
  setLabel: (text: string) => void;
  /** Open the dropdown. */
  open: () => void;
  /** Close the dropdown. */
  close: () => void;
  /** Toggle the dropdown. */
  toggle: () => void;
  /** Remove from DOM and clean up listeners. */
  destroy: () => void;
}

/**
 * Creates a combo button — a clickable label with a chevron that opens a dropdown menu.
 *
 * The entire label + chevron area acts as a single interactive unit with an optional
 * hover pill effect. Clicking anywhere on it toggles the dropdown.
 *
 * ```ts
 * import { createComboButton } from "@runtypelabs/persona";
 *
 * const combo = createComboButton({
 *   label: "Chat Assistant",
 *   menuItems: [
 *     { id: "star", label: "Star", icon: "star" },
 *     { id: "rename", label: "Rename", icon: "pencil" },
 *     { id: "delete", label: "Delete", icon: "trash-2", destructive: true, dividerBefore: true },
 *   ],
 *   onSelect: (id) => console.log("Selected:", id),
 * });
 * header.appendChild(combo.element);
 * ```
 */
export function createComboButton(options: CreateComboButtonOptions): ComboButtonHandle {
  const {
    label,
    icon = "chevron-down",
    menuItems,
    onSelect,
    position = "bottom-left",
    portal,
    className,
    hover,
  } = options;

  const wrapper = createElement(
    "div",
    "persona-combo-btn" + (className ? " " + className : ""),
  );
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.cursor = "pointer";
  wrapper.setAttribute("role", "button");
  wrapper.setAttribute("tabindex", "0");
  wrapper.setAttribute("aria-haspopup", "true");
  wrapper.setAttribute("aria-expanded", "false");
  wrapper.setAttribute("aria-label", label);

  // Label text
  const labelEl = createElement("span", "persona-combo-btn-label");
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  // Chevron icon
  const chevron = renderLucideIcon(icon, 14, "currentColor", 2);
  if (chevron) {
    chevron.style.marginLeft = "4px";
    chevron.style.opacity = "0.6";
    wrapper.appendChild(chevron);
  }

  // Hover pill effect
  if (hover) {
    wrapper.style.borderRadius = hover.borderRadius ?? "10px";
    wrapper.style.padding = hover.padding ?? "6px 4px 6px 12px";
    wrapper.style.border = "1px solid transparent";
    wrapper.style.transition = "background-color 0.15s ease, border-color 0.15s ease";
    wrapper.addEventListener("mouseenter", () => {
      wrapper.style.backgroundColor = hover.background ?? "";
      wrapper.style.borderColor = hover.border ?? "";
    });
    wrapper.addEventListener("mouseleave", () => {
      wrapper.style.backgroundColor = "";
      wrapper.style.borderColor = "transparent";
    });
  }

  // Dropdown
  const dropdown = createDropdownMenu({
    items: menuItems,
    onSelect: (id) => {
      wrapper.setAttribute("aria-expanded", "false");
      onSelect(id);
    },
    anchor: wrapper,
    position,
    portal,
  });

  if (!portal) {
    wrapper.appendChild(dropdown.element);
  }

  // Click toggles dropdown
  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.element.classList.contains("persona-hidden");
    wrapper.setAttribute("aria-expanded", isOpen ? "false" : "true");
    dropdown.toggle();
  });

  // Keyboard support
  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      wrapper.click();
    }
  });

  return {
    element: wrapper,
    setLabel: (text: string) => {
      labelEl.textContent = text;
      wrapper.setAttribute("aria-label", text);
    },
    open: () => {
      wrapper.setAttribute("aria-expanded", "true");
      dropdown.show();
    },
    close: () => {
      wrapper.setAttribute("aria-expanded", "false");
      dropdown.hide();
    },
    toggle: () => {
      const isOpen = !dropdown.element.classList.contains("persona-hidden");
      wrapper.setAttribute("aria-expanded", isOpen ? "false" : "true");
      dropdown.toggle();
    },
    destroy: () => {
      dropdown.destroy();
      wrapper.remove();
    },
  };
}
