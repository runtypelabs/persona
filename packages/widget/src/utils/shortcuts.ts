/**
 * Keyboard shortcuts: one declaration, three artifacts that cannot drift — the
 * keydown binding, the tooltip hint chip (`formatCombo`), and the control's
 * `aria-keyshortcuts` value (`ariaCombo`).
 *
 * Escape is reserved: dismissal stays on the surfaces that own it and never
 * passes through this registry.
 */

/** Parsed combo. `key` is lowercased so it compares against `event.key`. */
export interface ShortcutCombo {
  key: string;
  /** Meta on Apple platforms, Control everywhere else. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export type ShortcutScope = "widget" | "page";

export interface ShortcutRegistration {
  /** Stable identity, used only in warnings. */
  id: string;
  /** e.g. `"mod+b"`, `"mod+shift+k"`. */
  combo: string;
  run: (event: KeyboardEvent) => void;
  /** Returning false skips the binding for this keypress. */
  when?: () => boolean;
  /** Default `"widget"`: fires only from inside the widget mount. */
  scope?: ShortcutScope;
  /** Default false: text entry swallows the combo. */
  allowInInput?: boolean;
  /** Stamped with `aria-keyshortcuts` while registered. */
  element?: HTMLElement | null;
}

export interface ShortcutRegistry {
  /** Returns an unregister function. A duplicate combo keeps the first. */
  register(entry: ShortcutRegistration): () => void;
  destroy(): void;
}

let platformOverride: boolean | null = null;

/** Test seam. `null` restores platform sniffing. */
export const setMacPlatformOverride = (value: boolean | null): void => {
  platformOverride = value;
};

/** True where the "mod" modifier means Command rather than Control. */
export const isMacPlatform = (): boolean => {
  if (platformOverride !== null) return platformOverride;
  if (typeof navigator === "undefined") return false;
  const agent = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const raw = agent.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(raw);
};

/** Key values whose canonical casing a title-case fallback would get wrong. */
const KEY_NAMES = "ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Space";

const warn = (why: string, combo: string): void => {
  console.warn(`[persona] ${why} shortcut: ${combo}`);
};

/**
 * Parse `"mod+shift+b"` into a normalized combo. Returns null (with a warning)
 * for an unknown modifier, a missing or reserved key, or more than one non-mod
 * modifier.
 */
export const parseCombo = (combo: string): ShortcutCombo | null => {
  const parts = combo.toLowerCase().split("+").map((part) => part.trim());
  const key = parts.pop() as string;
  const parsed: ShortcutCombo = { key, mod: false, shift: false, alt: false };
  for (const part of parts) {
    if (part === "mod" || part === "cmd" || part === "ctrl") parsed.mod = true;
    else if (part === "shift") parsed.shift = true;
    else if (part === "alt" || part === "option") parsed.alt = true;
    else return warn("unknown modifier in", combo), null;
  }
  // v1 takes "mod" plus at most one of shift/alt. Enter and Escape are
  // reserved: submit and dismissal keep their own paths.
  if (
    !parsed.mod ||
    (parsed.shift && parsed.alt) ||
    /^(enter|esc(ape)?)$/.test(key) ||
    !/^([^+\s]|[a-z]{2,12})$/.test(key)
  ) {
    return warn("unsupported", combo), null;
  }
  // `event.key` for the spacebar is a literal space.
  if (key === "space") parsed.key = " ";
  return parsed;
};

const keyName = (key: string): string =>
  KEY_NAMES.split(" ").find((name) => name.toLowerCase() === key) ??
  (key === " "
    ? "Space"
    : key.length === 1
      ? key.toUpperCase()
      : key[0].toUpperCase() + key.slice(1));

/** Every combo carries "mod", so only shift/alt vary below. */
const format = (combo: string, aria: boolean): string => {
  const parsed = parseCombo(combo);
  if (!parsed) return "";
  const mac = isMacPlatform();
  const key = keyName(parsed.key);
  if (!aria && mac) {
    return `${parsed.alt ? "⌥" : ""}${parsed.shift ? "⇧" : ""}⌘${key}`;
  }
  const parts = [aria ? (mac ? "Meta" : "Control") : "Ctrl"];
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
};

/**
 * Display string for a tooltip hint chip: `"⌘B"` / `"⇧⌘B"` on Apple platforms
 * (symbols, no separator), `"Ctrl+B"` / `"Ctrl+Shift+B"` elsewhere. An
 * unparseable combo formats as an empty string.
 */
export const formatCombo = (combo: string): string => format(combo, false);

/**
 * `aria-keyshortcuts` value, which names modifiers per the ARIA spec rather
 * than the platform's display symbols: `"Meta+B"` on Apple, `"Control+B"`
 * elsewhere.
 */
export const ariaCombo = (combo: string): string => format(combo, true);

const matches = (combo: ShortcutCombo, event: KeyboardEvent): boolean =>
  event.key?.toLowerCase() === combo.key &&
  (isMacPlatform() ? event.metaKey : event.ctrlKey) === combo.mod &&
  // The other platform's modifier must be clear, or ctrl+cmd+b would fire.
  !(isMacPlatform() ? event.ctrlKey : event.metaKey) &&
  event.shiftKey === combo.shift &&
  event.altKey === combo.alt;

const isTextEntry = (node: EventTarget | null): boolean => {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
};

/**
 * One keydown listener for the whole widget instance. `scopeElement` is the
 * widget mount: `"widget"` bindings only fire from a target inside it (shadow
 * DOM included, via `composedPath`), `"page"` bindings fire anywhere.
 */
export const createShortcutRegistry = (
  scopeElement: Element | null
): ShortcutRegistry => {
  const entries = new Map<string, ShortcutRegistration & { parsed: ShortcutCombo }>();
  const doc = scopeElement?.ownerDocument ?? (typeof document !== "undefined" ? document : null);

  const inScope = (entry: ShortcutRegistration, event: KeyboardEvent): boolean => {
    if ((entry.scope ?? "widget") === "page") return true;
    if (!scopeElement) return false;
    const path = event.composedPath?.();
    if (path?.length) return path.includes(scopeElement);
    return scopeElement.contains(event.target as Node | null);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || !entries.size) return;
    const target = event.composedPath?.()[0] ?? event.target;
    for (const entry of entries.values()) {
      if (!matches(entry.parsed, event)) continue;
      if (entry.when?.() === false) continue;
      if (!inScope(entry, event)) continue;
      if (!entry.allowInInput && isTextEntry(target)) continue;
      event.preventDefault();
      try {
        entry.run(event);
      } catch (error) {
        warn(`${entry.id} threw on`, entry.combo);
        console.warn(error);
      }
      return;
    }
  };

  doc?.addEventListener("keydown", onKeyDown);

  return {
    register(entry) {
      const parsed = parseCombo(entry.combo);
      if (!parsed) return () => {};
      const slot = `${parsed.mod ? "m" : ""}${parsed.shift ? "s" : ""}${
        parsed.alt ? "a" : ""
      }${parsed.key}`;
      const existing = entries.get(slot);
      if (existing) {
        // First registration wins; the loser is dropped, not queued.
        warn(`${existing.id} already owns`, entry.combo);
        return () => {};
      }
      entries.set(slot, { ...entry, parsed });
      entry.element?.setAttribute("aria-keyshortcuts", ariaCombo(entry.combo));
      return () => {
        // Only the owner clears the slot: a rejected duplicate must not.
        if (entries.get(slot)?.id === entry.id) entries.delete(slot);
        entry.element?.removeAttribute("aria-keyshortcuts");
      };
    },
    destroy() {
      entries.clear();
      doc?.removeEventListener("keydown", onKeyDown);
    },
  };
};
