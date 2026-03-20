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







