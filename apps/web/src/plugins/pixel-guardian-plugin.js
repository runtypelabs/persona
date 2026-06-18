// Example plugin: a fully custom `renderApproval` renderer drawn as a tiny
// PIXEL-ART GUARDIAN — "the Gatekeeper" — who literally stands guard over every
// tool call. It's the showcase counterpart to the built-in approval card: where
// the built-in is a neutral, production-ready surface, this shows how far a
// `renderApproval` plugin can go in OWNING the entire approval experience.
//
// What it demonstrates:
//   * The `renderApproval` plugin hook and its `approve` / `deny` callbacks.
//   * `approve({ remember: true })` for an "always allow" affordance — the same
//     binary approve outcome, with a `remember` flag the SDK forwards to your
//     `config.approval.onDecision` so YOU can persist a don't-ask-again policy.
//   * Branching on `approval.status`: `renderApproval` is called again every time
//     the status changes (pending → approved / denied / timeout), so we return a
//     different view per state. Pending → the guardian + speech bubble; approved
//     → the gate opens and a one-line "granted" trace; denied/timeout → the
//     guardian raises his shield and a "blocked" trace.
//   * Self-contained PIXEL ART with NO external assets: the sprite is authored as
//     a string grid + a colour legend, expanded into a 16×16 SVG of 1×1 <rect>s
//     and scaled up crisply (`shape-rendering: crispEdges`). Idle animation (a
//     gentle bob + a flickering torch + shimmering eyes) is pure CSS keyframes.
//
// Plugin Kit usage: this renderer adds NO global listeners (every click handler
// lives on an element inside the returned card and is garbage-collected with it)
// and opens NO popovers, so it needs no per-message teardown bookkeeping — unlike
// the keyboard-driven built-in card. The one Plugin Kit helper it does need is
// `injectStyles`, which is REQUIRED: a plain `document.head` <style> would not
// reach elements rendered inside the widget's shadow root, so the guardian would
// render unstyled when `useShadowDom: true`. `injectStyles` puts the <style> in
// the right root (shadow or head) and is idempotent across re-renders.
//
// Copy this file into your own app; its only dependency is the widget's
// `@runtypelabs/persona/plugin-kit` subpath.

import { injectStyles } from "@runtypelabs/persona/plugin-kit";

const STYLE_ID = "pixel-guardian-plugin";

// ---------------------------------------------------------------------------
// 1. The sprite — pixel art as data
// ---------------------------------------------------------------------------
// The guardian is authored as a 16-row grid of characters. Each non-"." glyph
// maps to a colour in PALETTE and becomes one 1×1 <rect> in the SVG below. This
// "string art + legend" pattern keeps the art readable and tweakable right here
// in source — edit a character, change a pixel.
//
//   helmet crest (C), steel helm (S/L/D outline #), glowing eyes (E),
//   gold gorget + belt (G), blue armour (A/a), and a lit torch on the right
//   (handle H, flame O/I).
const SPRITE = [
  ".......CC.......",
  "......C##C......",
  "..#SSSSSSSS#..I.",
  "..#LLLLLLLL#.OIO",
  "..#DDDDDDDD#.OIO",
  "..#SEEDDEES#..O.",
  "..#SSSSSSSS#..H.",
  "..#GGGGGGGG#.DHD",
  ".#aAAAAAAAAa#.H.",
  ".#aAAAAAAAAa#.H.",
  ".#aAGGGGGGAa#.H.",
  ".#aAAAAAAAAa#.H.",
  ".#aaaaaaaaaa#.H.",
  "..##########..H.",
  "..............H.",
  "................",
];

const PALETTE = {
  "#": "#21242c", // outline / dark steel
  S: "#8b95a8", // steel mid
  L: "#c4ccd8", // steel highlight
  D: "#3f4655", // steel shadow / visor
  E: "#8defff", // eye glow
  C: "#e0506a", // helmet crest
  G: "#e9c46a", // gold trim
  A: "#4a6aa0", // armour (light)
  a: "#324b73", // armour (dark)
  H: "#7a5230", // torch handle
  O: "#ff7a1a", // flame (outer)
  I: "#ffd24a", // flame (inner)
};

// Glyphs that get an animation hook: the flame flickers, the eyes shimmer.
const FLAME = new Set(["O", "I"]);
const EYE = new Set(["E"]);

const SVG_NS = "http://www.w3.org/2000/svg";

// Expand the string grid into an SVG of 1×1 rects. The SVG's viewBox is the
// art's native 16×16; CSS scales it up (see `.pg-svg`). `crispEdges` keeps the
// pixels hard instead of anti-aliasing them into mush.
const buildSprite = () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("class", "pg-svg");
  svg.setAttribute("aria-hidden", "true");
  SPRITE.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      const fill = PALETTE[glyph];
      if (!fill) return; // "." → transparent, no rect
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", fill);
      if (FLAME.has(glyph)) rect.setAttribute("class", "pg-flame");
      else if (EYE.has(glyph)) rect.setAttribute("class", "pg-eye");
      svg.appendChild(rect);
    });
  });
  return svg;
};

// ---------------------------------------------------------------------------
// 2. Small DOM helpers
// ---------------------------------------------------------------------------
const el = (tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const button = (className, label, action) => {
  const b = el("button", className);
  b.type = "button";
  b.setAttribute("data-action", action);
  b.textContent = label;
  return b;
};

// Turn a raw tool name into something a human reads: `search_docs` →
// "Search docs", `searchDocs` → "Search docs". (The demo's tool name is already
// human, but a real one usually isn't.)
const humanizeToolName = (name) => {
  if (!name) return "the tool";
  return String(name)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
};

// `toolType` is a free-form string the demo uses as a source label ("from
// Runtype"). Skip the internal WebMCP marker — it isn't a human source name.
const sourceLabel = (approval) =>
  approval.toolType && approval.toolType !== "webmcp" ? approval.toolType : null;

const spriteStage = (modifier) => {
  const stage = el("div", `pg-sprite ${modifier}`);
  const label = el("span", "pg-name");
  label.textContent = "GATEKEEPER";
  stage.append(buildSprite(), label);
  return stage;
};

// ---------------------------------------------------------------------------
// 3. Pending view — the guardian asks for passage
// ---------------------------------------------------------------------------
const buildPending = (approval, approve, deny) => {
  const card = el("div", "pg-card");

  const stage = el("div", "pg-scene");
  stage.append(spriteStage("pg-sprite--idle"));

  const column = el("div", "pg-col");

  // Speech bubble. `Halt! The assistant wants to use "{tool}" [from {source}].
  // Shall I let it pass?`
  const bubble = el("div", "pg-bubble");
  const say = el("p", "pg-say");
  const tool = humanizeToolName(approval.toolName);
  const source = sourceLabel(approval);
  say.append(
    "Halt! The assistant wants to use ",
    Object.assign(el("strong"), { textContent: `“${tool}”` }),
    source ? ` from ${source}` : "",
    ". Shall I let it pass?"
  );
  bubble.appendChild(say);

  const actions = el("div", "pg-actions");
  // ✦ Allow → approve once. "Always let this through" → approve({ remember:true })
  // (the demo logs "(remember)" in its Event log when the flag comes through).
  // Deny → deny(). All three are wired through one delegated listener below.
  actions.append(
    button("pg-btn pg-btn--allow", "✦ Allow", "allow"),
    button("pg-btn pg-btn--always", "Always let this through", "always"),
    button("pg-btn pg-btn--deny", "Deny", "deny")
  );

  column.append(bubble, actions);
  stage.append(column);
  card.appendChild(stage);

  // Single delegated click listener. It lives on `card`, so it's released with
  // the card when the approval resolves and the widget swaps in the resolved
  // view — no global state to track.
  card.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) return;
    switch (target.getAttribute("data-action")) {
      case "allow":
        approve();
        break;
      case "always":
        approve({ remember: true });
        break;
      case "deny":
        deny();
        break;
    }
  });

  return card;
};

// ---------------------------------------------------------------------------
// 4. Resolved view — a one-line trace + a closing flourish
// ---------------------------------------------------------------------------
// approved → the gate opens and the guardian steps aside (CSS one-shot). denied
// / timeout → he raises his shield. Either way we leave a subtle trace so the
// transcript reads as a log. (Returning a hidden element on approve — letting
// the tool call fully take over, like the built-in — is equally valid; this
// keeps the guardian's verdict visible because it's more fun to show off.)
const buildResolved = (approval) => {
  const approved = approval.status === "approved";
  const row = el("div", `pg-trace ${approved ? "pg-trace--ok" : "pg-trace--no"}`);

  row.append(
    spriteStage(`pg-sprite--mini ${approved ? "pg-sprite--aside" : "pg-sprite--guard"}`)
  );

  const text = el("span", "pg-trace-text");
  const verdict = approved
    ? "granted ✓"
    : approval.status === "timeout"
      ? "timed out ✕"
      : "blocked ✕";
  text.append(
    Object.assign(el("strong"), { textContent: humanizeToolName(approval.toolName) }),
    ` — ${verdict}`
  );
  row.appendChild(text);

  return row;
};

// ---------------------------------------------------------------------------
// 5. The styles
// ---------------------------------------------------------------------------
// Theme-aware where it matters (card/bubble/trace pull from `--persona-*`
// tokens so the guardian sits naturally on any theme), but the sprite itself
// keeps a fixed pixel-art palette on purpose. Injected via `injectStyles` so it
// reaches the widget's shadow root.
const STYLE_CSS = `
  .pg-card {
    width: 100%;
    box-sizing: border-box;
    margin: 0.25rem 0;
    padding: 0.25rem 0;
  }
  .pg-scene {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    flex-wrap: wrap;
  }

  /* --- sprite + its name tag --- */
  .pg-sprite {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }
  .pg-svg {
    width: 76px;
    height: 76px;
    image-rendering: pixelated;
    display: block;
    filter: drop-shadow(0 2px 3px rgba(11, 11, 11, 0.18));
  }
  .pg-name {
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace;
    font-size: 0.55rem;
    letter-spacing: 0.14em;
    font-weight: 700;
    color: var(--persona-muted, #6b7280);
  }
  /* Idle: gentle bob (whole sprite) + flickering torch + shimmering eyes. */
  .pg-sprite--idle .pg-svg { animation: pg-bob 1.7s ease-in-out infinite; }
  .pg-flame {
    transform-box: fill-box;
    transform-origin: center bottom;
    animation: pg-flicker 0.45s steps(2, end) infinite;
  }
  .pg-eye {
    transform-box: fill-box;
    animation: pg-eye 2.6s ease-in-out infinite;
  }
  @keyframes pg-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes pg-flicker {
    0% { opacity: 1; transform: scaleY(1); }
    50% { opacity: 0.8; transform: scaleY(1.18); }
    100% { opacity: 0.92; transform: scaleY(0.94); }
  }
  @keyframes pg-eye { 0%, 100% { opacity: 0.82; } 50% { opacity: 1; } }

  /* --- speech bubble --- */
  .pg-col { flex: 1 1 12rem; min-width: 0; }
  .pg-bubble {
    position: relative;
    background: var(--persona-surface, #ffffff);
    border: 1px solid var(--persona-border, rgba(11, 11, 11, 0.12));
    border-radius: 0.7rem;
    padding: 0.6rem 0.8rem;
    box-shadow: 0 1px 2px rgba(11, 11, 11, 0.06), 0 4px 14px rgba(11, 11, 11, 0.05);
  }
  /* Little tail pointing left at the guardian. A second, offset triangle draws
     the border edge so the tail matches the bubble's outline. */
  .pg-bubble::before,
  .pg-bubble::after {
    content: "";
    position: absolute;
    top: 16px;
    width: 0;
    height: 0;
    border: 8px solid transparent;
  }
  .pg-bubble::before {
    left: -16px;
    border-right-color: var(--persona-border, rgba(11, 11, 11, 0.12));
  }
  .pg-bubble::after {
    left: -14px;
    border-right-color: var(--persona-surface, #ffffff);
  }
  .pg-say {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.45;
    color: var(--persona-text, #1f2937);
  }
  .pg-say strong { font-weight: 700; }

  /* --- action buttons (pixel-button styling: hard offset shadow, press-down) --- */
  .pg-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }
  .pg-btn {
    font: inherit;
    font-weight: 600;
    font-size: 0.8125rem;
    cursor: pointer;
    border: none;
    padding: 0.4rem 0.7rem;
    border-radius: 0.45rem;
    transition: transform 0.06s ease, box-shadow 0.06s ease, filter 0.12s ease, background 0.12s ease;
  }
  /* The press-down: the button drops onto its own hard shadow. */
  .pg-btn:active { transform: translateY(2px); }
  .pg-btn--allow {
    background: linear-gradient(180deg, #ffd35a, #ff9f1c);
    color: #432d05;
    box-shadow: 0 2px 0 #b9711a;
  }
  .pg-btn--allow:hover { filter: brightness(1.05); }
  .pg-btn--allow:active { box-shadow: 0 0 0 #b9711a; }
  .pg-btn--always {
    background: var(--persona-container, rgba(11, 11, 11, 0.05));
    color: var(--persona-text, #1f2937);
    box-shadow: 0 2px 0 rgba(11, 11, 11, 0.14);
  }
  .pg-btn--always:hover { background: var(--persona-container, rgba(11, 11, 11, 0.09)); }
  .pg-btn--always:active { box-shadow: 0 0 0 rgba(11, 11, 11, 0.14); }
  .pg-btn--deny {
    background: transparent;
    color: #b4232a;
    box-shadow: inset 0 0 0 1.5px rgba(180, 35, 42, 0.5);
  }
  .pg-btn--deny:hover { background: rgba(180, 35, 42, 0.08); }

  /* --- resolved trace --- */
  .pg-trace {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0.4rem 0;
    font-size: 0.85rem;
    color: var(--persona-muted, #6b7280);
    animation: pg-slide 0.35s ease both;
  }
  .pg-trace-text strong { font-weight: 700; color: var(--persona-text, #1f2937); }
  .pg-trace--ok .pg-trace-text { color: #1f9d57; }
  .pg-trace--no .pg-trace-text { color: #b4232a; }
  /* Mini sprite for the trace: drop the name tag, shrink, and stop the idle bob. */
  .pg-sprite--mini .pg-svg { width: 40px; height: 40px; }
  .pg-sprite--mini .pg-name { display: none; }
  .pg-sprite--mini .pg-flame { animation-duration: 0.6s; }
  /* approved → the guardian steps aside (gate opens). */
  .pg-sprite--aside .pg-svg { animation: pg-aside 0.55s ease both; }
  /* denied / timeout → he raises his shield with a quick brace. */
  .pg-sprite--guard .pg-svg { animation: pg-guard 0.5s ease both; }
  @keyframes pg-slide { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
  @keyframes pg-aside {
    0% { transform: translateX(0) rotate(0); }
    55% { transform: translateX(7px) rotate(4deg); }
    100% { transform: translateX(5px) rotate(2deg); }
  }
  @keyframes pg-guard {
    0% { transform: translateX(0) rotate(0); }
    35% { transform: translateX(-3px) rotate(-7deg); }
    100% { transform: translateX(0) rotate(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .pg-svg, .pg-flame, .pg-eye, .pg-trace { animation: none !important; }
  }
`;

// ---------------------------------------------------------------------------
// 6. The plugin
// ---------------------------------------------------------------------------
/**
 * Create the Pixel Guardian approval renderer.
 *
 * No options today — it's a self-contained showcase. Kept as a factory (rather
 * than only a bare object) to match the other example plugins and to leave room
 * for future config (e.g. a custom character name) without a breaking change.
 */
export const createPixelGuardianPlugin = () => ({
  id: "example-pixel-guardian",

  renderApproval: ({ message, approve, deny }) => {
    const approval = message?.approval;
    if (!approval) return null;

    const root =
      approval.status === "pending"
        ? buildPending(approval, approve, deny)
        : buildResolved(approval);

    // REQUIRED for shadow-DOM widgets: a document-head <style> wouldn't reach
    // the shadow root. Idempotent, so re-renders don't pile up <style> tags.
    injectStyles(root, STYLE_ID, STYLE_CSS);
    return root;
  },
});

// Default instance for the common `plugins: [pixelGuardianPlugin]` case.
export const pixelGuardianPlugin = createPixelGuardianPlugin();
