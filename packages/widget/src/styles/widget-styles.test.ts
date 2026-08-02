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
    expect(rule).toContain("max-width: var(--persona-welcome-max-width, 640px)");
    expect(rule).toContain("margin-inline: auto");
    // The var is published on the root so plugin content can consume it.
    expect(widgetCss).toContain("--persona-welcome-max-width: 640px");
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
});
