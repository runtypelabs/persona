// The collapsed launcher's share of widget.css, for embedding in
// launcher.global.js.
//
// The installer used to hold the launcher's first paint until all of widget.css
// had downloaded, though the launcher matches only a small part of it. The
// critical bundle now carries that part and paints as soon as its own script
// arrives; the full stylesheet loads afterwards, off the critical path, and
// repeats these rules verbatim so nothing changes when it lands.
//
// Selection is conservative: a rule is kept unless one of its selectors can be
// shown never to match while only the critical bundle has run. A selector is
// ruled out only when it names a `persona-` class, a `data-*` attribute or an id
// that the launcher bundle's code never mentions, so it cannot have created
// such an element. Anything else (element and state selectors, resets, custom
// property blocks, `@font-face`, `@property`) is kept. Keeping too much costs
// bytes; keeping too little would restyle the launcher when widget.css arrives,
// which `e2e/specs/23-dist-install-methods.spec.ts` checks in a real browser.
import { transform } from "lightningcss";

const version = (major, minor = 0) => (major << 16) | (minor << 8);

/** The stylesheet's browser floor, as in `build-styles.mjs`. */
export const CSS_TARGETS = {
  chrome: version(94),
  edge: version(94),
  firefox: version(93),
  safari: version(15, 4),
  ios_saf: version(15, 4),
};

/** Stands in for the stylesheet text until the launcher chunk is rendered. */
export const LAUNCHER_CSS_PLACEHOLDER = "__PERSONA_LAUNCHER_CRITICAL_CSS__";

const camelCase = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** At-rules whose only content is the rules nested inside them. */
const CONTAINERS = new Set(["media", "supports", "container", "layer-block", "starting-style", "scope", "nesting"]);

/**
 * @param {string | Uint8Array} css Full stylesheet (source or minified).
 * @param {string} vocabulary The launcher bundle's code, without the stylesheet.
 * @returns {string} Minified rules the collapsed launcher can match, in source order.
 */
export function extractLauncherCss(css, vocabulary) {
  const mentions = (token) => vocabulary.includes(token);
  // `el.dataset.fooBar = …` sets `data-foo-bar` without spelling it out.
  const mentionsAttribute = (name) =>
    !name.startsWith("data-") || mentions(name) || mentions(camelCase(name.slice(5)));

  /** Whether any selector in a list could match an element the launcher created. */
  const anyPossible = (selectors) => selectors.some(possible);
  const possible = (selector) =>
    selector.every((part) => {
      switch (part.type) {
        case "class":
        case "id":
          return mentions(part.name);
        case "attribute":
          return mentionsAttribute(part.name);
        case "pseudo-class":
          // `:not()` narrows rather than requires; everything else that takes a
          // selector list needs one of its branches to be possible.
          if (part.kind === "not" || !Array.isArray(part.selectors)) return true;
          return anyPossible(part.selectors);
        default:
          return true;
      }
    });

  const filter = (code, visitor) =>
    transform({ filename: "widget.css", code, minify: true, targets: CSS_TARGETS, visitor }).code;

  const kept = filter(typeof css === "string" ? Buffer.from(css) : css, {
    Rule(rule) {
      if (rule.type === "style" && !anyPossible(rule.value.selectors)) return [];
      return undefined;
    },
    RuleExit(rule) {
      if (CONTAINERS.has(rule.type) && rule.value.rules?.length === 0) return [];
      return undefined;
    },
  });

  // Drop keyframes no kept declaration refers to.
  const text = kept.toString();
  const withoutKeyframes = filter(kept, {
    Rule(rule) {
      return rule.type === "keyframes" ? [] : undefined;
    },
  }).toString();
  return filter(Buffer.from(text), {
    Rule(rule) {
      if (rule.type !== "keyframes") return undefined;
      const name = rule.value.name?.value ?? rule.value.name;
      return typeof name === "string" && !withoutKeyframes.includes(name) ? [] : undefined;
    },
  }).toString();
}

/**
 * What the installer stamps on the critical launcher from outside its bundle:
 * the delayed loading ring shown while a clicked launcher's widget loads.
 */
const INSTALLER_VOCABULARY = "data-persona-loading";

/**
 * Bundler plugin for the launcher entry: once the chunk is rendered, its code is
 * the launcher's whole vocabulary, so derive the stylesheet from it and put it
 * where `launcher-critical-css.ts` left the placeholder.
 *
 * @param {() => string | Uint8Array} readStylesheet
 */
export function launcherCriticalCss(readStylesheet) {
  const literal = new RegExp(`(["'\`])${LAUNCHER_CSS_PLACEHOLDER}\\1`);
  return {
    name: "launcher-critical-css",
    renderChunk(code) {
      if (!literal.test(code)) return null;
      const vocabulary = `${code.replace(literal, '""')}\n${INSTALLER_VOCABULARY}`;
      const css = extractLauncherCss(readStylesheet(), vocabulary);
      // A function replacement: the stylesheet may contain `$` sequences.
      return { code: code.replace(literal, () => JSON.stringify(css)), map: null };
    },
  };
}
