import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const widgetCss = readFileSync(
  new URL("./widget.css", import.meta.url),
  "utf8",
);

describe("suggestion interaction styles", () => {
  it("keeps suggestion surfaces from collapsing inside constrained transcripts", () => {
    const selector = ".persona-suggestions {";
    const start = widgetCss.indexOf(selector);
    const end = widgetCss.indexOf("\n}", start);
    const surfaceRule = widgetCss.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(surfaceRule).toContain("flex-shrink: 0");
  });

  it("keeps the primary emphasis a quiet accent rather than a solid fill", () => {
    const selector = '.persona-suggestion[data-emphasis="primary"] {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("border-color: var(--persona-primary)");
    // Plain declaration first so engines without color-mix stay transparent.
    expect(rule).toContain("background: transparent");
    expect(rule).toContain(
      "background: color-mix(in srgb, var(--persona-primary) 6%, transparent)",
    );
    expect(rule).not.toContain("--persona-text-inverse");
  });

  it("strengthens the primary wash on hover instead of filling it", () => {
    const selector =
      '.persona-suggestion[data-emphasis="primary"]:hover {';
    const start = widgetCss.indexOf(selector);
    const hoverRule = widgetCss.slice(start, widgetCss.indexOf("\n  }", start));

    expect(start).toBeGreaterThan(-1);
    expect(hoverRule).toContain("border-color: var(--persona-primary)");
    expect(hoverRule).toContain(
      "color-mix(in srgb, var(--persona-primary) 12%, transparent)",
    );
    expect(hoverRule).not.toContain("filter: brightness");
  });

  it("rests cards flat and reserves the shadow plus lift for hover", () => {
    const restStart = widgetCss.indexOf(".persona-suggestion--card {");
    const restRule = widgetCss.slice(
      restStart,
      widgetCss.indexOf("\n}", restStart),
    );

    expect(restStart).toBeGreaterThan(-1);
    expect(restRule).toContain(
      "box-shadow: var(--persona-components-suggestion-card-shadow, none)",
    );

    const hoverStart = widgetCss.indexOf(".persona-suggestion--card:hover {");
    const hoverRule = widgetCss.slice(
      hoverStart,
      widgetCss.indexOf("\n  }", hoverStart),
    );

    expect(hoverStart).toBeGreaterThan(-1);
    expect(hoverRule).toContain("box-shadow: var(--persona-shadow-sm)");
    expect(hoverRule).toContain("transform: translateY(-1px)");
  });

  it("reveals the suggestion arrow only on hover and keyboard focus", () => {
    // Searched past `__copy`: the bare selector also appears in the shared
    // `flex: 0 0 auto` group above it and the coarse-pointer override below.
    const restStart = widgetCss.indexOf(
      ".persona-suggestion__arrow {",
      widgetCss.indexOf(".persona-suggestion__copy {"),
    );
    const restRule = widgetCss.slice(
      restStart,
      widgetCss.indexOf("\n}", restStart),
    );

    expect(restStart).toBeGreaterThan(-1);
    expect(restRule).toContain("opacity: 0;");
    expect(restRule).toContain("transition: opacity");
    expect(widgetCss).toContain(
      ".persona-suggestion:focus-visible .persona-suggestion__arrow",
    );
    expect(widgetCss).toContain(
      ".persona-suggestion:hover .persona-suggestion__arrow",
    );
  });

  it("caps the starter card grid so wide panels get two columns", () => {
    expect(widgetCss).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    );
    const selector =
      '.persona-suggestions[data-variant="card"][data-persona-suggestion-surface="starter"] {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("max-width: 600px");
  });

  it("centers label-only items and top-aligns only description cards", () => {
    const cardStart = widgetCss.indexOf(".persona-suggestion--card {");
    const cardRule = widgetCss.slice(
      cardStart,
      widgetCss.indexOf("\n}", cardStart),
    );
    expect(cardRule).toContain("align-items: center");

    const listStart = widgetCss.indexOf(".persona-suggestion--list {");
    const listRule = widgetCss.slice(
      listStart,
      widgetCss.indexOf("\n}", listStart),
    );
    expect(listRule).toContain("align-items: center");

    // Only content that actually wraps to two lines earns the top alignment.
    const hasStart = widgetCss.indexOf(
      ".persona-suggestion--card:has(.persona-suggestion__description)",
    );
    const hasRule = widgetCss.slice(
      hasStart,
      widgetCss.indexOf("\n}", hasStart),
    );
    expect(hasStart).toBeGreaterThan(-1);
    expect(hasRule).toContain(
      ".persona-suggestion--list:has(.persona-suggestion__description)",
    );
    expect(hasRule).toContain("align-items: flex-start");
  });

  it("masks only the scrollable chip edges that still contain content", () => {
    expect(widgetCss).toContain(
      '[data-overflow="scroll"][data-scroll-right]:not(',
    );
    expect(widgetCss).toContain(
      '[data-overflow="scroll"][data-scroll-left]:not(',
    );
    expect(widgetCss).toContain(
      '[data-overflow="scroll"][data-scroll-left][data-scroll-right]',
    );
    expect(widgetCss).toContain(
      "--persona-suggestion-scroll-fade-size: 32px",
    );
  });

  it("centers the chip row on the composer surface only", () => {
    const selector =
      '[data-persona-composer-suggestions].persona-suggestions[data-variant="chip"] {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    // fit-content + auto margins center a single row while wrapped rows keep
    // a shared left edge; per-row justify-content would rag them.
    expect(rule).toContain("width: fit-content");
    expect(rule).toContain("max-width: 100%");
    expect(rule).toContain("margin-inline: auto");
    expect(rule).not.toContain("justify-content");

    // Transcript follow-ups and welcome rows keep the default left alignment.
    const sharedStart = widgetCss.indexOf(
      '.persona-suggestions[data-variant="chip"] {',
    );
    const sharedRule = widgetCss.slice(
      sharedStart,
      widgetCss.indexOf("\n}", sharedStart),
    );
    expect(sharedStart).toBeGreaterThan(-1);
    expect(sharedRule).not.toContain("justify-content");
  });

  it("only pulls follow-ups up against the roomy welcome-visible body gap", () => {
    // Unscoped, the -12px offset would zero out the tightened 12px gap that
    // applies when the welcome host is hidden, gluing follow-ups to the answer.
    expect(widgetCss).toContain(
      '.persona-gap-6 > [data-persona-suggestions="follow-up"] {',
    );
    expect(widgetCss).not.toMatch(
      /\n\[data-persona-suggestions="follow-up"\] \{/,
    );
  });
});

describe("composer spacing styles", () => {
  it("themes the composer form padding and gap with utility-matching fallbacks", () => {
    const selector =
      "[data-persona-root] .persona-widget-composer:not(.persona-pill-composer) {";
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    // Fallbacks reproduce `persona-px-4 persona-py-3` and `persona-gap-2`.
    expect(rule).toContain(
      "padding: var(--persona-composer-padding, 0.75rem 1rem)",
    );
    expect(rule).toContain("gap: var(--persona-composer-gap, 0.5rem)");
  });

  it("themes the composer textarea type with text-sm fallbacks", () => {
    const selector = "[data-persona-root] .persona-composer-textarea {";
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "font-size: var(--persona-composer-font-size, 0.875rem)",
    );
    expect(rule).toContain(
      "line-height: var(--persona-composer-line-height, 1.25rem)",
    );
  });

  it("leaves the pill composer on its own single-row geometry", () => {
    const start = widgetCss.indexOf(".persona-pill-composer {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("padding: 6px 14px");
    expect(rule).toContain("gap: 8px");
  });
});

describe("header control styles", () => {
  it("sizes and strokes the glyph from the header control tokens", () => {
    const start = widgetCss.indexOf(".persona-header-control--glyph > svg {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "width: var(--persona-header-control-icon-size, 20px)",
    );
    // CSS presentation beats the SVG stroke-width attribute, which stays as
    // the no-CSS fallback.
    expect(rule).toContain(
      "stroke-width: var(--persona-components-header-controlStrokeWidth, 1.5)",
    );
  });

  it("thins the sparse glyph stroke by the same 0.7 the JS attributes use", () => {
    const start = widgetCss.indexOf(".persona-header-control--sparse > svg {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "width: calc(var(--persona-header-control-icon-size, 20px) * 1.4)",
    );
    // 0.7 x the 1.5 default is 1.05, the stroke the close X has always
    // rendered at; SPARSE_GLYPHS in header-parts.ts carries the same pair.
    expect(rule).toContain(
      "stroke-width: calc(var(--persona-components-header-controlStrokeWidth, 1.5) * 0.7)",
    );

    // The sparse rule must stay after the glyph rule: same specificity, so
    // source order is the only thing that lets it win.
    expect(start).toBeGreaterThan(
      widgetCss.indexOf(".persona-header-control--glyph > svg {"),
    );
  });
});

describe("launcher icon styles", () => {
  it("strokes every launcher glyph from the stroke token, surface-neutrally", () => {
    // Locate the rule by its declaration and read the SHIPPED selector back
    // out of the file, so a rescope cannot slip past a hardcoded expectation.
    const declaration =
      "stroke-width: var(--persona-components-launcher-iconStrokeWidth, 1.5)";
    const declarationAt = widgetCss.indexOf(declaration);
    expect(declarationAt).toBeGreaterThan(-1);
    const selectorStart = widgetCss.lastIndexOf("}", declarationAt) + 1;
    const selector = widgetCss
      .slice(selectorStart, widgetCss.indexOf("{", selectorStart))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();

    // One pill, one line weight: the agent icon and the call-to-action arrow
    // both follow the token.
    expect(selector).toContain('[data-role="launcher-icon"] > svg');
    expect(selector).toContain(
      '[data-role="launcher-call-to-action-icon"] > svg',
    );
    // Both launcher surfaces render under [data-persona-root]; naming either
    // surface here would change stroke weight between the two bundles.
    expect(selector).not.toContain("data-persona-launcher-critical");
    expect(selector).not.toContain("persona-widget-container");
  });
});

describe("composer control size styles", () => {
  it("sizes every composer control box from the control-size token with a 40px fallback", () => {
    const start = widgetCss.indexOf(".persona-composer-control {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    for (const property of ["width", "height", "min-width", "min-height"]) {
      expect(rule).toContain(
        `${property}: var(--persona-composer-control-size, 40px)`,
      );
    }
  });

  it("sizes control glyphs from the control-icon-size token with a 24px fallback", () => {
    const start = widgetCss.indexOf(".persona-composer-control--glyph > svg {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "width: var(--persona-composer-control-icon-size, 24px)",
    );
    expect(rule).toContain(
      "height: var(--persona-composer-control-icon-size, 24px)",
    );
  });

  it("keeps text-label action buttons on the token height while width follows padding", () => {
    const selector =
      ".persona-composer-control.persona-composer-action-button--text {";
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("width: auto");
    expect(rule).toContain("min-width: 0");
    // Height is deliberately absent: the base rule's token height still wins.
    expect(rule).not.toContain("height:");
  });

  it("floors the hit area at 40px on coarse pointers", () => {
    const start = widgetCss.indexOf(
      "@media (pointer: coarse) {\n  .persona-composer-control {",
    );
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n  }", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("min-width: 40px");
    expect(rule).toContain("min-height: 40px");
  });
});


describe("transcript layout styles", () => {
  it("drops the empty messages wrapper from the flex flow", () => {
    // A zero-height flex child still triggers the body's gap, so an empty
    // transcript added phantom scrollable space below the welcome (and a
    // scroll-to-bottom arrow with nothing to scroll to).
    expect(widgetCss).toContain(
      ".persona-widget-messages:empty {\n  display: none;\n}",
    );
  });
});

describe("launcher teaser styles", () => {
  it("keeps the [hidden] dismiss control hidden despite its own display: grid", () => {
    // dismissible: false sets the hidden property; without this companion
    // rule the block's display: grid outranks the UA [hidden] stylesheet.
    expect(widgetCss).toContain(
      ".persona-launcher-teaser-dismiss[hidden] {\n  display: none;\n}",
    );
  });
});

describe("plugin welcome styles", () => {
  it("hides the default welcome content while a plugin element owns the host", () => {
    const selector =
      '.persona-welcome[data-persona-welcome-content="plugin"]\n  > :not([data-persona-welcome-plugin]) {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("display: none !important");
  });

  it("centers the welcome column at wide widths but never the overlay", () => {
    const start = widgetCss.indexOf(
      ".persona-welcome:not([data-persona-welcome-overlay]) {",
    );
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    // The card variant shares the transcript column so its left-aligned
    // text lines up with messages and composer.
    expect(rule).toContain("max-width: var(--persona-content-max-width, 768px)");
    expect(rule).toContain("margin-inline: auto");
    // The var is published on the root so plugin content can consume it.
    expect(widgetCss).toContain("--persona-welcome-max-width: 640px");
  });

  it("keeps the narrower centered column for the hero variant only", () => {
    const start = widgetCss.indexOf(
      '.persona-welcome[data-persona-welcome-variant="hero"]:not(',
    );
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("max-width: var(--persona-welcome-max-width, 640px)");
  });

  it("aligns the greeting bubble to the transcript column", () => {
    const start = widgetCss.indexOf(".persona-welcome-greeting {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("max-width: var(--persona-content-max-width, 768px)");
    expect(rule).toContain("margin-inline: auto");
  });

  it("pads the welcome host from the intro-card alias, full padding on overlays", () => {
    // Flat default resolves the alias to `1.5rem 0` (tokens.ts), aligning
    // the text with the content column; overlays are opaque surfaces and
    // keep a fixed symmetric inset.
    const start = widgetCss.indexOf(".persona-welcome {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("padding: var(--persona-intro-card-padding, 1.5rem)");

    const overlayStart = widgetCss.indexOf(
      ".persona-welcome[data-persona-welcome-overlay] {",
    );
    const overlayRule = widgetCss.slice(
      overlayStart,
      widgetCss.indexOf("\n}", overlayStart),
    );
    expect(overlayRule).toContain("padding: 1.5rem");
  });

  it("overlays the messages area while plugin content is active", () => {
    const start = widgetCss.indexOf(
      ".persona-welcome[data-persona-welcome-overlay] {",
    );
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("position: absolute");
    expect(rule).toContain("inset: 0");
    // !important: only way to beat the host's inline intro-card background
    // (default transparent), which otherwise lets the transcript bleed
    // through the overlay.
    expect(rule).toMatch(/background:[\s\S]*!important/);
    // Two classes so it outranks the body's own overflow utility.
    expect(widgetCss).toContain(
      ".persona-widget-body.persona-welcome-overlay-active {\n  overflow: hidden;\n}",
    );
  });

  it("takes the transcript out of layout so nothing scrolls under the overlay", () => {
    // The rule above cannot win against the inline `overflow-y: auto` that
    // fill/fullscreen layouts stamp on the body, so the transcript stayed
    // scrollable underneath an `inset: 0` box whose containing block scrolls
    // with it: home and the transcript then read as one column, with no
    // composer, and scrolling past the overlay left the transcript bare.
    const selector =
      ".persona-widget-body.persona-welcome-overlay-active\n  > :not([data-persona-welcome-overlay]) {";
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("display: none !important");
  });
});

describe("scrollbar policy styles", () => {
  it("themes every scroller from the shared tokens", () => {
    // scrollbar-color inherits from the root; scrollbar-width does not, so
    // the width needs the descendant star.
    expect(widgetCss).toMatch(
      /\[data-persona-root\] \{\n {2}scrollbar-color: var\(\n\s+--persona-scrollbar-thumb,/,
    );
    expect(widgetCss).toContain("var(--persona-scrollbar-track, transparent)");
    expect(widgetCss).toContain(
      "[data-persona-root],\n[data-persona-root] * {\n  scrollbar-width: thin;\n}",
    );
    // The artifact tab strip keeps its own token as an alias layered on the
    // shared thumb token.
    expect(widgetCss).toContain(
      "--persona-artifact-tab-list-scrollbar,\n    var(--persona-scrollbar-thumb, var(--persona-border, #e5e7eb))",
    );
  });

  it("hides the transcript bar at rest under the on-scroll policy without reflow", () => {
    // Rest state keys off the ui.ts-owned attributes; the reveal attribute
    // must appear as a :not() so flipping it shows the bar again.
    expect(widgetCss).toContain(
      '[data-persona-scrollbar="on-scroll"]\n  .persona-widget-body:not([data-persona-scrollbar-visible]),\n[data-persona-scrollbar="hidden"] .persona-widget-body {\n  scrollbar-width: none;\n}',
    );
    // Old-Safari fallback: webkit hiding agrees with the standard property.
    expect(widgetCss).toContain(
      '[data-persona-scrollbar="hidden"] .persona-widget-body::-webkit-scrollbar {\n  display: none;\n}',
    );
    // Classic-scrollbar platforms must not reflow the transcript on toggle.
    expect(widgetCss).toContain(
      '[data-persona-scrollbar="on-scroll"] .persona-widget-body {\n  scrollbar-gutter: stable;\n}',
    );
  });

  it("hover-reveals inner scroller bars under the on-scroll policy", () => {
    expect(widgetCss).toContain(
      '[data-persona-scrollbar="on-scroll"] .persona-artifact-list:not(:hover)',
    );
    expect(widgetCss).toContain(
      '[data-persona-scrollbar="on-scroll"]\n  .persona-suggestions[data-overflow="scroll"]:not(:hover)',
    );
    expect(widgetCss).toContain(
      '[data-persona-scrollbar="hidden"] .persona-artifact-list,',
    );
  });
});

describe("message action button styles", () => {
  it("rounds the hit target on the medium radius, not the near-square small one", () => {
    const start = widgetCss.indexOf(".persona-message-action-btn {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "border-radius: var(--persona-message-action-radius, var(--persona-radius-md, 0.375rem))",
    );
    expect(rule).not.toContain("--persona-radius-sm");
  });

  it("hovers with the scheme-aware ghost wash and text color, not surface or brand", () => {
    const start = widgetCss.indexOf(".persona-message-action-btn:hover {");
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "background-color: var(--persona-message-action-hover-bg, var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.05)))",
    );
    expect(rule).toContain(
      "color: var(--persona-message-action-hover-fg, var(--persona-text, #111827))",
    );
    // A surface token is nearly invisible on light and paints a darker box on
    // dark; the brand color is never an icon-hover color.
    expect(rule).not.toContain("--persona-container");
    expect(rule).not.toContain("--persona-primary");
  });
});

describe("conversation-open skeleton styles", () => {
  it("follows each role's real bubble radius chain", () => {
    const leading = ".persona-conversation-loading-bubble {";
    const start = widgetCss.indexOf(leading);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));
    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain(
      "border-radius: var(--persona-message-assistant-radius, var(--persona-radius-lg, 0.5rem))",
    );

    const trailing = ".persona-conversation-loading-bubble--trailing {";
    const trailingStart = widgetCss.indexOf(trailing);
    const trailingRule = widgetCss.slice(
      trailingStart,
      widgetCss.indexOf("\n}", trailingStart),
    );
    expect(trailingStart).toBeGreaterThan(-1);
    expect(trailingRule).toContain(
      "border-radius: var(--persona-message-user-radius, var(--persona-radius-lg, 0.5rem))",
    );
  });
});

describe("overflow menu row shading", () => {
  it("shades a folded built-in row on a focus attribute, never on plain focus-within", () => {
    // `:focus-within` matches the programmatic focus `open()` puts on the first
    // row, so a mouse-opened menu would shade whichever row sorts first.
    expect(widgetCss).toContain(
      ".persona-composer-overflow-menu__slot[data-persona-menu-focus]"
    );
    expect(widgetCss).not.toContain(
      ".persona-composer-overflow-menu__slot:focus-within"
    );
  });

  it("keeps both row kinds on the same hover plus visible-focus pair", () => {
    expect(widgetCss).toContain(".persona-composer-overflow-menu__item:hover");
    expect(widgetCss).toContain(
      ".persona-composer-overflow-menu__item:focus-visible"
    );
    expect(widgetCss).toContain(".persona-composer-overflow-menu__slot:hover");
  });

  it("reads every overflowMenu token as a full path over the stock fallback", () => {
    const at = widgetCss.indexOf(".persona-composer-overflow-menu {");
    expect(at, "overflow menu panel rule not found").toBeGreaterThan(-1);
    const panel = widgetCss.slice(at, widgetCss.indexOf("}", at));

    expect(panel).toContain(
      "--persona-components-composer-overflowMenu-background,"
    );
    expect(panel).toContain("var(--persona-surface, #ffffff)");
    expect(panel).toContain(
      "--persona-components-composer-overflowMenu-borderColor,"
    );
    expect(panel).toContain("var(--persona-border, #e5e7eb)");
    expect(panel).toContain(
      "--persona-components-composer-overflowMenu-borderRadius,"
    );
    expect(panel).toContain(
      "--persona-components-composer-overflowMenu-foreground,"
    );
    expect(panel).toContain(
      "--persona-components-composer-overflowMenu-shadow,"
    );
  });

  it("keeps the portaled panel rule unprefixed", () => {
    // createPopover mounts the panel outside the widget root, so a
    // `[data-persona-root]` prefix would never match it.
    expect(widgetCss).not.toContain(
      "[data-persona-root] .persona-composer-overflow-menu"
    );
  });
});

describe("composer control focus rings", () => {
  /** The rule body following a selector, up to its closing brace. */
  const ruleFor = (selector: string): string => {
    const at = widgetCss.indexOf(selector);
    expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
    return widgetCss.slice(at, widgetCss.indexOf("}", at));
  };

  it("draws the composer focus ring inside the border box", () => {
    // Composer controls sit in fixed-gap clusters, so an outward ring grows the
    // control's footprint and fuses it with its neighbour.
    const rule = ruleFor(
      "[data-persona-root] .persona-composer-control:focus-visible"
    );
    expect(rule).toContain(".persona-composer-model-picker:focus-visible");
    expect(rule).toContain("outline-offset: -2px");
    expect(rule).not.toContain("outline-offset: 2px");
  });

  it("hangs the composer focus ring off the input focus-ring token", () => {
    expect(
      ruleFor("[data-persona-root] .persona-composer-control:focus-visible")
    ).toContain("--persona-components-input-focus-ring");
  });

  it("suppresses the control ring inside a menu row, where the row shades", () => {
    expect(
      ruleFor(
        ".persona-composer-overflow-menu__slot .persona-composer-control:focus-visible"
      )
    ).toContain("outline: none");
  });
});

describe("model picker chevron", () => {
  const ruleFor = (selector: string): string => {
    const at = widgetCss.indexOf(selector);
    expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
    return widgetCss.slice(at, widgetCss.indexOf("}", at));
  };

  it("drops the platform chevron", () => {
    // Chrome draws the UA arrow flush against the trailing edge and ignores
    // padding-inline-end, so padding alone cannot clear it.
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain("appearance: none");
    expect(rule).toContain("-webkit-appearance: none");
  });

  it("reserves a logical gutter for the chevron and keeps text start-aligned", () => {
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain("padding-inline-start: 0.625rem");
    expect(rule).toContain("padding-inline-end: 1.75rem");
    // Zero: the control-size token owns the height, not padding math.
    expect(rule).toContain("padding-block: 0;");
    expect(rule).toContain("text-align: start");
    // Physical padding would not flip under RTL.
    expect(rule).not.toContain("padding-right:");
    expect(rule).not.toContain("padding-left:");
  });

  it("truncates a long label instead of running it under the chevron", () => {
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain("text-overflow: ellipsis");
    expect(rule).toContain("overflow: hidden");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("max-width");
  });

  it("colors the chevron from the theme token, never a baked-in hex", () => {
    const rule = ruleFor(".persona-composer-model-picker-chevron");
    // Same chain as the label, so the glyph and the text never diverge.
    expect(rule).toContain(
      "--persona-components-composer-modelPicker-labelColor"
    );
    expect(rule).toContain("var(--persona-button-ghost-fg");
    // The mask only needs opaque alpha, so the SVG's own stroke is not a color.
    expect(rule).toContain("mask-image");
    expect(rule).toContain("-webkit-mask-image");
    expect(rule).not.toMatch(/stroke='%23[0-9a-fA-F]{3,6}'/);
  });

  it("uses the same lucide chevron-down geometry as the icon registry", () => {
    expect(ruleFor(".persona-composer-model-picker-chevron")).toContain(
      "m6 9 6 6 6-6"
    );
  });

  it("positions the chevron logically so it flips under RTL", () => {
    const rule = ruleFor(".persona-composer-model-picker-chevron");
    // `end` and `margin-inline-end` resolve against the inline axis, so dir=rtl
    // moves the chevron to the left edge with no physical override.
    expect(rule).toContain("justify-self: end");
    expect(rule).toContain("margin-inline-end: 0.625rem");
    expect(rule).not.toContain("right:");
    expect(rule).not.toContain("margin-right");
  });

  it("stacks the chevron over the select without stealing its clicks", () => {
    expect(ruleFor(".persona-composer-model-picker-wrapper {")).toContain(
      "display: inline-grid"
    );
    expect(ruleFor(".persona-composer-model-picker-wrapper > *")).toContain(
      "grid-area: 1 / 1"
    );
    expect(ruleFor(".persona-composer-model-picker-chevron")).toContain(
      "pointer-events: none"
    );
  });

  it("keeps the focus ring on the select, which paints the visible pill", () => {
    const rule = ruleFor(
      "[data-persona-root] .persona-composer-control:focus-visible"
    );
    expect(rule).toContain(".persona-composer-model-picker:focus-visible");
    expect(rule).toContain("outline-offset: -2px");
  });
});

describe("model picker height", () => {
  const ruleFor = (selector: string): string => {
    const at = widgetCss.indexOf(selector);
    expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
    return widgetCss.slice(at, widgetCss.indexOf("}", at));
  };

  const TOKEN = "var(--persona-composer-control-size, 40px)";

  it("rides the control-size token with a 40px fallback", () => {
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain(`height: ${TOKEN}`);
    expect(rule).toContain(`min-height: ${TOKEN}`);
  });

  it("keeps its width intrinsic, like a shortLabel action button", () => {
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain("width: auto");
    expect(rule).toContain("min-width: 0");
    expect(rule).toContain("max-width");
  });

  it("centers the label with a full-height line box, not padding", () => {
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain(`line-height: ${TOKEN}`);
    expect(rule).toContain("padding-block: 0;");
    // The dropdown rows must not inherit the tall line box.
    expect(
      ruleFor("[data-persona-root] .persona-composer-model-picker option")
    ).toContain("line-height: normal");
  });

  it("computes the same height as a text-label action button at any token value", () => {
    // Parity is the expression, not a pixel: both read the same token with the
    // same fallback, and both take their width from their label.
    const picker = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    const control = ruleFor(".persona-composer-control {");
    const textButton = ruleFor(
      ".persona-composer-control.persona-composer-action-button--text"
    );
    expect(control).toContain(`height: ${TOKEN}`);
    expect(control).toContain(`min-height: ${TOKEN}`);
    expect(picker).toContain(`height: ${TOKEN}`);
    expect(picker).toContain(`min-height: ${TOKEN}`);
    expect(textButton).toContain("width: auto");
    expect(textButton).toContain("min-width: 0");
    expect(picker).toContain("width: auto");
    expect(picker).toContain("min-width: 0");
  });

  it("floors the picker at a 40px hit area on a coarse pointer", () => {
    const block = widgetCss.match(
      /@media \(pointer: coarse\) \{\s*\[data-persona-root\] \.persona-composer-model-picker \{[^}]*\}/
    );
    expect(block, "no coarse-pointer floor for the model picker").not.toBeNull();
    expect(block![0]).toContain("min-height: 40px");
    expect(block![0]).toContain("min-width: 40px");
  });

  it("centers the chevron at any token value from the wrapper, not a fixed offset", () => {
    // The row is as tall as the select (the token), so centering follows the
    // token at 32px or 44px with no per-size rule.
    const wrapper = ruleFor(".persona-composer-model-picker-wrapper {");
    expect(wrapper).toContain("align-items: center");
    const chevron = ruleFor(".persona-composer-model-picker-chevron");
    expect(chevron).not.toContain("top:");
    expect(chevron).not.toContain("margin-block");
  });
});

describe("model picker popover", () => {
  const ruleFor = (selector: string): string => {
    const at = widgetCss.indexOf(selector);
    expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
    return widgetCss.slice(at, widgetCss.indexOf("}", at));
  };

  it("keeps the trigger on the select's own pill rule", () => {
    // The trigger carries `.persona-composer-model-picker` too, so a themed
    // page keeps the same box; this rule only adds the label/suffix row.
    const rule = ruleFor(
      "[data-persona-root] .persona-composer-model-picker-trigger {"
    );
    expect(rule).toContain("display: inline-flex");
    expect(rule).not.toContain("height:");
    expect(rule).not.toContain("border-radius:");
  });

  it("hides an empty suffix so an unset value leaves no gap", () => {
    expect(ruleFor(".persona-composer-model-picker-suffix:empty")).toContain(
      "display: none"
    );
  });

  it("reads every modelPicker token as a full path with a fallback", () => {
    const menu = ruleFor(".persona-composer-model-menu {");
    expect(menu).toContain(
      "--persona-components-composer-modelPicker-menuBackground,"
    );
    expect(menu).toContain("var(--persona-surface, #ffffff)");
    expect(menu).toContain(
      "--persona-components-composer-modelPicker-menuBorderRadius,"
    );
    expect(
      ruleFor(".persona-composer-model-picker-suffix {")
    ).toContain("--persona-components-composer-modelPicker-suffixColor,");
    expect(ruleFor(".persona-composer-model-option-label")).toContain(
      "--persona-components-composer-modelPicker-labelColor,"
    );
    expect(ruleFor(".persona-composer-model-option-description")).toContain(
      "--persona-components-composer-modelPicker-descriptionColor,"
    );
    expect(
      ruleFor(".persona-composer-model-option:hover,")
    ).toContain("--persona-components-composer-modelPicker-rowHoverBackground,");
  });

  it("keeps the portaled panel rules unprefixed", () => {
    // createPopover mounts the panel outside the widget root, so a
    // `[data-persona-root]` prefix would never match it.
    expect(widgetCss).not.toContain(
      "[data-persona-root] .persona-composer-model-menu"
    );
    expect(widgetCss).not.toContain(
      "[data-persona-root] .persona-composer-model-option"
    );
  });

  it("reveals the row check off aria-selected rather than rebuilding rows", () => {
    expect(widgetCss).toContain(
      ".persona-composer-model-option-check {\n  visibility: hidden;\n}"
    );
    expect(
      ruleFor('.persona-composer-model-option[aria-selected="true"]')
    ).toContain("visibility: visible");
  });
});

describe("model picker closed control surface", () => {
  const ruleFor = (selector: string): string => {
    const at = widgetCss.indexOf(selector);
    expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
    return widgetCss.slice(at, widgetCss.indexOf("}", at));
  };

  it("reads the surface tokens over the ghost button fallbacks", () => {
    // One vocabulary for both presentations: the native select and the popover
    // trigger share this rule, so a page that stays native still themes.
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain(
      "--persona-components-composer-modelPicker-background,"
    );
    expect(rule).toContain("var(--persona-button-ghost-bg, transparent)");
    expect(rule).toContain(
      "--persona-components-composer-modelPicker-borderRadius,"
    );
    expect(rule).toContain("var(--persona-button-ghost-radius");
    expect(rule).toContain(
      "--persona-components-composer-modelPicker-labelColor,"
    );
    expect(rule).toContain("var(--persona-button-ghost-fg");
  });

  it("draws borderColor as an inset ring so the control never resizes", () => {
    // A real border would eat 1px of the content box under `border-box` sizing
    // and shift the label on every theme that leaves the token unset.
    const rule = ruleFor("[data-persona-root] .persona-composer-model-picker {");
    expect(rule).toContain("border: none");
    expect(rule).toContain(
      "box-shadow: inset 0 0 0 1px\n    var(--persona-components-composer-modelPicker-borderColor, transparent)"
    );
  });

  it("keeps hover on its own token so a themed fill survives the pointer", () => {
    const rule = ruleFor(
      "[data-persona-root] .persona-composer-model-picker:hover:not(:disabled) {"
    );
    expect(rule).toContain(
      "--persona-components-composer-modelPicker-hoverBackground,"
    );
    expect(rule).toContain("var(--persona-button-ghost-hover-bg");
  });
});

describe("composer motion", () => {
  /** Every `@media (prefers-reduced-motion: no-preference)` block, joined. */
  const reducedMotionSafeCss = (): string => {
    const out: string[] = [];
    const marker = "@media (prefers-reduced-motion: no-preference)";
    let from = widgetCss.indexOf(marker);
    while (from !== -1) {
      // Brace-match the block so nested rules are captured whole.
      let depth = 0;
      let i = widgetCss.indexOf("{", from);
      const start = i;
      for (; i < widgetCss.length; i += 1) {
        if (widgetCss[i] === "{") depth += 1;
        else if (widgetCss[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      out.push(widgetCss.slice(start, i + 1));
      from = widgetCss.indexOf(marker, i);
    }
    return out.join("\n");
  };

  const safe = reducedMotionSafeCss();

  it("gates every new animation behind prefers-reduced-motion", () => {
    for (const marker of [
      "persona-mic-pulse",
      "persona-mic-spin",
      "persona-chip-enter",
      "persona-chip-exit",
    ]) {
      // The keyframes themselves are global (a keyframes block cannot live in a
      // media query and still be referenced outside it); what matters is that
      // nothing REFERENCES them outside the guarded block.
      const references = widgetCss
        .split(new RegExp(`animation:\\s*${marker}`))
        .length - 1;
      const guarded = safe.split(new RegExp(`animation:\\s*${marker}`)).length - 1;
      expect(references, `${marker} referenced`).toBeGreaterThan(0);
      expect(guarded, `${marker} guarded`).toBe(references);
    }
  });

  it("gates the composer transitions behind prefers-reduced-motion", () => {
    expect(safe).toContain(".persona-composer-action-button {");
    expect(safe).toContain("transition:");
    expect(safe).toContain("transform: scale(0.97)");
    expect(safe).toContain(".persona-composer-glyph-stack > [data-glyph]");
  });

  it("drives every composer animation off the motion tokens", () => {
    // A 0ms token is the documented kill switch, so nothing may hardcode a
    // duration or curve.
    for (const rule of safe.split("transition:").slice(1)) {
      const decl = rule.split(";")[0];
      expect(decl).toContain("var(--persona-motion-duration-");
      expect(decl).toContain("var(--persona-motion-easing");
    }
    expect(safe).toContain("var(--persona-motion-duration-base, 200ms)");
    expect(safe).toContain("var(--persona-motion-duration-fast, 120ms)");
  });

  it("keeps exactly one stacked glyph visible by attribute", () => {
    // Visibility is opacity keyed off data-mode, and it is NOT inside the
    // reduced-motion block: the state must swap visibly either way.
    expect(widgetCss).toContain(".persona-composer-glyph-stack > [data-glyph] {");
    expect(widgetCss).toContain(
      '.persona-composer-glyph-stack[data-mode="send"] > [data-glyph="send"]'
    );
    const at = widgetCss.indexOf(
      '.persona-composer-glyph-stack[data-mode="send"] > [data-glyph="send"]'
    );
    expect(widgetCss.slice(at, widgetCss.indexOf("}", at))).toContain("opacity: 1");
  });

  it("colors the recording pulse from the voice token chain", () => {
    const at = widgetCss.indexOf("@keyframes persona-mic-pulse");
    const block = widgetCss.slice(at, widgetCss.indexOf("\n}", at));
    expect(block).toContain("var(--persona-voice-recording-bg");
  });
});

describe("composer placement styles", () => {
  it("absolutely positions the footer only under placement overlay", () => {
    const selector =
      '[data-persona-root][data-persona-composer-placement="overlay"] .persona-widget-footer {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("position: absolute");
    expect(rule).toContain("inset: auto 0 var(--persona-composer-lift, 0px) 0");
    expect(rule).toContain(
      "background: var(--persona-composer-overlay-band, transparent)",
    );
  });

  it("reserves the composer zone on the plugin welcome overlay, which body padding cannot reach", () => {
    const selector =
      '[data-persona-root][data-persona-composer-placement="overlay"]\n  .persona-welcome[data-persona-welcome-overlay] {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("--persona-composer-overlay-height");
    expect(rule).toContain("--persona-composer-lift");
    expect(rule).toContain("--persona-composer-anchor-gap");
  });

  it("end-anchors the centered hero without justify-content in the scroll body", () => {
    const selector =
      '.persona-welcome[data-persona-welcome-anchor="center"][data-persona-welcome-variant="hero"] {';
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("margin-block: auto 0");
  });

  it("honors welcome.composerGap under block placement on the body and the plugin host", () => {
    const prefix =
      '[data-persona-root][data-persona-composer-placement="block"][data-persona-welcome-anchor="center"][data-persona-conversation-state="empty"]';
    for (const target of [
      ".persona-widget-body {",
      '.persona-welcome[data-persona-welcome-overlay] {',
    ]) {
      const start = widgetCss.indexOf(`${prefix}\n  ${target}`);
      expect(start).toBeGreaterThan(-1);
      const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));
      expect(rule).toContain(
        "padding-bottom: var(--persona-composer-anchor-gap, 24px)"
      );
    }
  });
});

describe("send button visibility and stop-state styles", () => {
  it("hides only the wrapper ui.ts stamped, leaving the rest of the row intact", () => {
    const selector = ".persona-send-button-wrapper[data-persona-send-hidden] {";
    const start = widgetCss.indexOf(selector);
    const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));

    expect(start).toBeGreaterThan(-1);
    expect(rule).toContain("display: none");
  });

  it("falls back to the idle appearance of each send-button mode in stop state", () => {
    const shared =
      '[data-persona-root] [data-persona-composer-submit][data-persona-send-mode="stop"] {';
    const sharedStart = widgetCss.indexOf(shared);
    const sharedRule = widgetCss.slice(sharedStart, widgetCss.indexOf("\n}", sharedStart));
    expect(sharedStart).toBeGreaterThan(-1);
    expect(sharedRule).toContain("--persona-send-button-fg: var(");
    expect(sharedRule).toContain("--persona-button-stop-fg");
    expect(sharedRule).toContain("--persona-button-primary-fg, #ffffff");

    const iconStart = widgetCss.indexOf(
      '.persona-composer-control[data-persona-composer-submit][data-persona-send-mode="stop"] {'
    );
    const iconRule = widgetCss.slice(iconStart, widgetCss.indexOf("\n}", iconStart));
    expect(iconStart).toBeGreaterThan(-1);
    expect(iconRule).toContain("--persona-button-stop-bg");
    expect(iconRule).toContain("--persona-button-primary-bg, var(--persona-primary");

    const textStart = widgetCss.indexOf(
      '.persona-bg-persona-accent[data-persona-composer-submit][data-persona-send-mode="stop"] {'
    );
    const textRule = widgetCss.slice(textStart, widgetCss.indexOf("\n}", textStart));
    expect(textStart).toBeGreaterThan(-1);
    expect(textRule).toContain(
      "background-color: var(--persona-button-stop-bg, var(--persona-accent, #0f0f0f))"
    );
  });
});

describe("message row geometry tokens", () => {
  it("owns the 85% row default per role so components.message.<role>.maxWidth can win", () => {
    for (const [selector, token] of [
      [
        '.persona-message-row[data-message-role="user"] > * {',
        "--persona-message-user-max-width, 85%",
      ],
      [
        '.persona-message-row[data-message-role="assistant"] > *,',
        "--persona-message-assistant-max-width, 85%",
      ],
    ] as const) {
      const start = widgetCss.indexOf(selector);
      expect(start).toBeGreaterThan(-1);
      const rule = widgetCss.slice(start, widgetCss.indexOf("\n}", start));
      expect(rule).toContain("--persona-message-row-max-width");
      expect(rule).toContain(token);
    }
  });
});
