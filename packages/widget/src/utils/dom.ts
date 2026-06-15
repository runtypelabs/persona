/**
 * DOM utility functions
 */
export const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
};

export const createElementInDocument = <K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] => {
  const element = documentRef.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
};

export const createFragment = (): DocumentFragment => {
  return document.createDocumentFragment();
};

export interface CreateNodeOptions {
  /** Sets `element.className`. */
  className?: string;
  /** Sets `element.textContent` before any `children` are appended. */
  text?: string;
  /** Attribute name → value pairs applied via `setAttribute`. */
  attrs?: Record<string, string>;
  /** Inline styles applied via `Object.assign(element.style, style)`. */
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * Ergonomic element factory that bundles the className + attribute + style +
 * children boilerplate the widget's DOM builders otherwise repeat by hand.
 *
 * `createElement` stays the right tool for the simple `(tag, className)` case;
 * reach for `createNode` when a node also needs attributes, inline styles, or
 * up-front children. Nullish `children` are skipped so callers can inline
 * conditionals (e.g. `maybeIcon && el`).
 */
export const createNode = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: CreateNodeOptions = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);

  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      element.setAttribute(name, value);
    }
  }
  if (options.style) {
    Object.assign(element.style, options.style);
  }

  const appendable = children.filter(
    (child): child is Node | string => child != null
  );
  if (appendable.length > 0) {
    element.append(...appendable);
  }

  return element;
};







