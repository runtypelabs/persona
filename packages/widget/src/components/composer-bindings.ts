/**
 * Atomic composer surface bindings.
 *
 * One object holds every element the composer behavior layer touches, plus the
 * listeners registered against them. A rebuild destroys the outgoing object and
 * installs a new one in a single step, so no stale element or listener can
 * survive a footer swap.
 *
 * Binding is selector-driven: the stable `data-persona-composer-*` attributes
 * first, then the legacy class fallbacks, so custom plugin composers written
 * before those attributes existed still bind.
 */

import { createElement } from "../utils/dom";

/** Regions the doc guarantees are non-null after a successful bind. */
export type ComposerRegionName =
  | "header"
  | "body"
  | "actionsStart"
  | "actionsEnd"
  | "suggestions"
  | "status";

/** Elements found in the bound footer; null when the surface omits them. */
export interface ComposerFoundElements {
  header: HTMLElement | null;
  body: HTMLElement | null;
  actionsStart: HTMLElement | null;
  actionsEnd: HTMLElement | null;
  actionsRow: HTMLElement | null;
  suggestions: HTMLElement | null;
  status: HTMLElement | null;
}

export interface ComposerSurfaceBindings {
  footer: HTMLElement;
  form: HTMLFormElement;
  /** Textarea, or the inline contenteditable surface after the mention swap. */
  input: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  actionsStart: HTMLElement;
  actionsEnd: HTMLElement;
  suggestions: HTMLElement;
  status: HTMLElement;
  attachmentInput?: HTMLInputElement;
  attachmentPreviews?: HTMLElement;
  attachmentButton?: HTMLButtonElement;
  sendButton?: HTMLButtonElement;
  micButton?: HTMLButtonElement;
  /** Regions this binding created because the surface had none. */
  synthesized: ReadonlySet<ComposerRegionName>;
  /** Raw lookups, before synthesis. Callers that must not render into a
   *  synthesized region read these. */
  found: ComposerFoundElements;
  /** Register a composer-scoped listener; `destroy()` removes it. */
  addListener: (
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeListener: (
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void;
  destroy: () => void;
}

export interface BindComposerSurfaceOptions {
  /** Debug widgets throw on a malformed surface instead of bailing quietly. */
  debug?: boolean;
}

const pick = <T extends HTMLElement>(
  root: HTMLElement,
  ...selectors: string[]
): T | null => {
  for (const selector of selectors) {
    const found = root.querySelector<T>(selector);
    if (found) return found;
  }
  return null;
};

/**
 * Synthesized regions are `display: contents`: present in the tree (so Phase 2
 * contributions have somewhere to render) with no box of their own, so a bound
 * plugin composer's layout is untouched.
 */
const synthesizeRegion = (className: string, attribute: string): HTMLElement => {
  const el = createElement("div", className);
  el.setAttribute(attribute, "");
  el.setAttribute("data-persona-composer-synthesized", "");
  el.style.display = "contents";
  return el;
};

/**
 * Bind `footer` as the live composer surface. Returns null (after a warning)
 * when a required element is missing outside debug mode; the caller must have
 * already destroyed the previous bindings, so nothing stale stays active.
 */
export function bindComposerSurface(
  footer: HTMLElement,
  options: BindComposerSurfaceOptions = {}
): ComposerSurfaceBindings | null {
  const form = pick<HTMLFormElement>(footer, "[data-persona-composer-form]");
  const input = pick<HTMLElement>(footer, "[data-persona-composer-input]");

  if (!form || !input) {
    const missing = [!form && "form", !input && "input"]
      .filter(Boolean)
      .join(", ");
    const message = `[Persona] composer surface is missing required element(s): ${missing}. Mark them with data-persona-composer-form / data-persona-composer-input.`;
    // A footer with NEITHER marker is a gating composer (a plugin rendering
    // something other than an input); that is a supported pattern, so it warns
    // even in debug. A half-marked surface is malformed and fails loudly.
    if (options.debug && (form || input)) throw new Error(message);
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(message);
    }
    return null;
  }

  const found: ComposerFoundElements = {
    header: pick<HTMLElement>(footer, "[data-persona-composer-header]"),
    body: pick<HTMLElement>(footer, "[data-persona-composer-body]"),
    actionsStart: pick<HTMLElement>(
      footer,
      "[data-persona-composer-actions-start]",
      ".persona-widget-composer__left-actions"
    ),
    actionsEnd: pick<HTMLElement>(
      footer,
      "[data-persona-composer-actions-end]",
      ".persona-widget-composer__right-actions"
    ),
    actionsRow: pick<HTMLElement>(
      footer,
      "[data-persona-composer-actions]",
      ".persona-widget-composer .persona-flex.persona-items-center.persona-justify-between"
    ),
    suggestions: pick<HTMLElement>(
      footer,
      "[data-persona-composer-suggestions]",
      ".persona-mb-3.persona-flex.persona-flex-wrap.persona-gap-2"
    ),
    status: pick<HTMLElement>(footer, "[data-persona-composer-status]"),
  };

  const synthesized = new Set<ComposerRegionName>();

  let header = found.header;
  if (!header) {
    synthesized.add("header");
    header = synthesizeRegion(
      "persona-widget-composer__header",
      "data-persona-composer-header"
    );
    if (form.parentNode) form.parentNode.insertBefore(header, form);
    else footer.appendChild(header);
  }

  // The editor's own container is the body region: no wrapper is invented for
  // a surface that already lays its input out.
  const body = found.body ?? input.parentElement ?? form;

  const region = (
    name: ComposerRegionName,
    existing: HTMLElement | null,
    className: string,
    attribute: string,
    host: HTMLElement
  ): HTMLElement => {
    if (existing) return existing;
    synthesized.add(name);
    const el = synthesizeRegion(className, attribute);
    host.appendChild(el);
    return el;
  };

  const actionsStart = region(
    "actionsStart",
    found.actionsStart,
    "persona-widget-composer__left-actions",
    "data-persona-composer-actions-start",
    form
  );
  const actionsEnd = region(
    "actionsEnd",
    found.actionsEnd,
    "persona-widget-composer__right-actions",
    "data-persona-composer-actions-end",
    form
  );
  const suggestions = region(
    "suggestions",
    found.suggestions,
    "persona-widget-composer__suggestions",
    "data-persona-composer-suggestions",
    footer
  );
  const status = region(
    "status",
    found.status,
    "persona-widget-composer__status",
    "data-persona-composer-status",
    footer
  );

  type Entry = {
    target: EventTarget;
    type: string;
    handler: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  };
  let entries: Entry[] = [];

  const sameEntry = (entry: Entry, other: Omit<Entry, "options">): boolean =>
    entry.target === other.target &&
    entry.type === other.type &&
    entry.handler === other.handler;

  const attachmentInput =
    pick<HTMLInputElement>(
      footer,
      "[data-persona-composer-attachment-input]",
      'input[type="file"]'
    ) ?? undefined;

  return {
    footer,
    form,
    input,
    header,
    body,
    actionsStart,
    actionsEnd,
    suggestions,
    status,
    attachmentInput,
    attachmentPreviews:
      pick<HTMLElement>(
        footer,
        "[data-persona-composer-attachment-previews]",
        ".persona-attachment-previews"
      ) ?? undefined,
    attachmentButton:
      pick<HTMLButtonElement>(
        footer,
        "[data-persona-composer-attachment-button]",
        ".persona-attachment-button"
      ) ?? undefined,
    sendButton:
      pick<HTMLButtonElement>(footer, "[data-persona-composer-submit]") ??
      undefined,
    micButton:
      pick<HTMLButtonElement>(footer, "[data-persona-composer-mic]") ??
      undefined,
    synthesized,
    found,
    addListener: (target, type, handler, listenerOptions) => {
      target.addEventListener(type, handler, listenerOptions);
      entries.push({ target, type, handler, options: listenerOptions });
    },
    removeListener: (target, type, handler, listenerOptions) => {
      target.removeEventListener(type, handler, listenerOptions);
      entries = entries.filter(
        (entry) => !sameEntry(entry, { target, type, handler })
      );
    },
    destroy: () => {
      for (const entry of entries) {
        entry.target.removeEventListener(entry.type, entry.handler, entry.options);
      }
      entries = [];
    },
  };
}
