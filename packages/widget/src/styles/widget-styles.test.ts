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
