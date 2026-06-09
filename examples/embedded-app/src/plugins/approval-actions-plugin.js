// Example plugin: shows an alternative tool-approval bubble — a permission
// prompt with an expandable "BotName wants to use <tool>" header plus a split
// "Always allow ⏎ / Allow once ⌘⏎" primary control and a "Deny Esc" button,
// with keyboard shortcuts.
//
// Demonstrates the `renderApproval` plugin hook and its `approve` / `deny`
// callbacks. Register the default instance:
//   plugins: [approvalActionsPlugin]
// …or configure the source icon via the factory:
//   plugins: [createApprovalActionsPlugin({ icons: { Runtype: "/runtype-logo.svg" } })]
//   plugins: [createApprovalActionsPlugin({ faviconService: true })] // Google fallback
//
// The icon box resolves in order: explicit `icons` map → optional favicon
// service (off by default) → default tool icon.
//
// An approval is a single binary gate (approved / denied), so there are exactly
// two outcomes. "Always allow" vs "Allow once" is the same `approve` outcome
// with a `{ remember: true }` flag — the widget resolves THIS approval
// identically either way, and forwards `remember` to `config.approval.onDecision`
// so you can persist a don't-ask-again policy for FUTURE approvals yourself.
//
// `renderApproval` is called again whenever the approval status changes, so we
// branch on `approval.status`. Unlike the built-in renderer (a persistent
// "Approved/Denied" bubble), this plugin owns the resolved state: pending → the
// interactive prompt; approved → nothing (an empty element, so the tool call
// takes over the transcript); denied/timeout → a subtle one-line trace.
//
// This version uses the widget's Plugin Kit (`@runtypelabs/persona/plugin-kit`)
// for the cross-cutting bits every non-trivial plugin needs:
//   * `injectStyles` — Shadow-DOM-safe <style> injection (a `document.head`
//     <style> would not reach elements rendered inside the widget's shadow root).
//   * `createPopover` — the floating "Allow once" menu: portaled out of the
//     transcript's scroll container, positioned from the anchor, dismissed on
//     outside click, repositioned on scroll/resize, auto-closed if the anchor
//     leaves the DOM.
//   * `isEditableEventTarget` — so the Enter/Esc shortcuts don't fire while the
//     user is typing in the composer.
//
// Copy this file into your own app; its only dependency is the widget's
// plugin-kit subpath.

import {
  createPopover,
  injectStyles,
  isEditableEventTarget,
} from "@runtypelabs/persona/plugin-kit";

const STYLE_ID = "approval-actions-plugin";
const ICON = "24px";
const GAP = "0.75rem"; // gap between icon and title (cds gap-3)
const STYLE_CSS = `
  .appr-card {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    background: var(--persona-surface, #ffffff);
    border: 0.5px solid var(--persona-border, rgba(11, 11, 11, 0.1));
    border-radius: 0.75rem;
    padding: 0.5rem;
    margin: 0.5rem 0;
    box-shadow: 0 1px 2px 0 rgba(11, 11, 11, 0.06), 0 2px 8px 0 rgba(11, 11, 11, 0.04);
  }
  .appr-head {
    display: flex;
    align-items: center;
    gap: ${GAP};
    width: 100%;
    border: none;
    background: transparent;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    text-align: left;
    color: var(--persona-text, #0b0b0b);
    font: inherit;
    border-radius: 0.5rem;
    transition: background 0.12s ease;
  }
  .appr-head:hover { background: var(--persona-container, rgba(11, 11, 11, 0.04)); }
  .appr-head[data-static="true"] { cursor: default; }
  .appr-head[data-static="true"]:hover { background: transparent; }
  .appr-logo {
    flex-shrink: 0;
    width: ${ICON};
    height: ${ICON};
    display: grid;
    place-items: center;
    padding: 2px;
    box-sizing: border-box;
    border: 0.5px solid var(--persona-border, rgba(11, 11, 11, 0.12));
    border-radius: 6.5px;
    background: var(--persona-surface, #ffffff);
    box-shadow: 0 1px 2px 0 rgba(11, 11, 11, 0.08);
    color: var(--persona-muted, #6b7280);
    overflow: hidden;
  }
  /* Explicit icons (e.g. a wordmark) fill the box; the default tool glyph keeps
     favicon-like padding. */
  .appr-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .appr-logo svg { width: 16px; height: 16px; display: block; }
  .appr-title {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--persona-text, #0b0b0b);
  }
  .appr-title strong { font-weight: 600; }
  /* Inline collapse/expand chevron, right after the title text. inline-flex so
     the SVG sits on the text's optical center. */
  .appr-toggle {
    display: inline-flex;
    align-items: center;
    margin-left: 0.25rem;
    color: var(--persona-muted, #6b7280);
    vertical-align: middle;
    transition: transform 0.15s ease;
  }
  .appr-toggle svg { width: 0.85rem; height: 0.85rem; display: block; }
  .appr-head[aria-expanded="false"] .appr-toggle { transform: rotate(-90deg); }
  /* Content indents under the title text: icon width + gap + the head's left pad. */
  .appr-body {
    padding: 0.5rem 0.6rem 0.35rem calc(${ICON} + ${GAP} + 0.6rem);
  }
  .appr-params {
    margin: 0 0 0.75rem;
    padding: 0.7rem 0.85rem;
    border-radius: 0.625rem;
    /* Translucent dark tint so the well is distinct from the card surface on
       any theme (the card bg is var(--persona-surface)). */
    background: rgba(11, 11, 11, 0.04);
    color: var(--persona-text, #1f2937);
    font-size: 0.75rem;
    line-height: 1rem;
    overflow-x: auto;
    max-height: 9rem;
  }
  .appr-params[hidden] { display: none; }
  /* Subtle resolved (denied/timeout) trace. */
  .appr-resolved {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0.5rem 0;
    padding: 0.3rem 0.15rem;
    font-size: 0.8rem;
    color: var(--persona-muted, #6b7280);
  }
  .appr-resolved svg { width: 0.95rem; height: 0.95rem; display: block; flex-shrink: 0; }
  .appr-resolved-name { font-weight: 600; }
  .appr-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .appr-split { position: relative; display: inline-flex; }
  .appr-primary, .appr-caret, .appr-deny {
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    transition: background 0.12s ease, box-shadow 0.12s ease;
  }
  .appr-primary {
    background: var(--persona-text, #0b0b0b);
    color: var(--persona-surface, #ffffff);
    padding: 0 0.75rem;
    border-radius: 0.5rem 0 0 0.5rem;
  }
  .appr-caret {
    position: relative;
    background: var(--persona-text, #0b0b0b);
    color: var(--persona-surface, #ffffff);
    width: 2rem;
    justify-content: center;
    padding: 0;
    border-radius: 0 0.5rem 0.5rem 0;
  }
  .appr-caret svg { width: 0.95rem; height: 0.95rem; display: block; }
  /* Faint divider between the primary and caret halves of the split control. */
  .appr-caret::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 1px;
    background: var(--persona-surface, #ffffff);
    opacity: 0.25;
    transition: opacity 0.12s ease;
  }
  /* Hide the divider while either half is hovered. */
  .appr-caret:hover::before,
  .appr-primary:hover + .appr-caret::before { opacity: 0; }
  /* Lighten the near-black halves with a translucent-white overlay (theme-safe,
     since the base is var(--persona-text)). Each half hovers independently. */
  .appr-primary:hover { box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.16); }
  .appr-caret:hover { box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.16); }
  .appr-deny {
    background: var(--persona-container, rgba(11, 11, 11, 0.04));
    color: var(--persona-text, #1f2937);
    padding: 0 0.75rem;
    border-radius: 0.5rem;
    /* Theme border + a faint concrete dark hairline so the ring reads a touch
       darker even when --persona-border resolves light. */
    box-shadow:
      inset 0 0 0 0.5px var(--persona-border, rgba(0, 0, 0, 0.1)),
      inset 0 0 0 0.5px rgba(0, 0, 0, 0.09);
  }
  /* Darken only the fill; leave the box-shadow (the hairline border) untouched
     so the original ring stays exactly as at rest. An overlay shadow would
     bleed through the semi-transparent ring and darken the border too. */
  .appr-deny:hover { background: rgba(11, 11, 11, 0.05); }
  /* Portaled out of the transcript by createPopover and positioned (top/left/
     min-width) from the split control's rect, so it overlays above the rest of
     the UI (composer included) and is never clipped by the scroll container. */
  .appr-menu {
    width: max-content;
    max-width: 18rem;
    box-sizing: border-box;
    background: var(--persona-surface, #ffffff);
    border: 0.5px solid var(--persona-border, rgba(11, 11, 11, 0.1));
    border-radius: 0.625rem;
    box-shadow: 0 8px 24px rgba(11, 11, 11, 0.12), 0 2px 6px rgba(11, 11, 11, 0.08);
    padding: 0.25rem;
    white-space: nowrap;
  }
  .appr-menu-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 0.875rem;
    color: var(--persona-text, #1f2937);
    padding: 0.45rem 0.6rem;
    border-radius: 0.4rem;
    text-align: left;
    transition: background 0.12s ease;
  }
  .appr-menu-item:hover { background: var(--persona-container, rgba(11, 11, 11, 0.06)); }
  .appr-kbd {
    font-family: inherit;
    font-size: 0.75rem;
    line-height: 1;
    opacity: 0.7;
    margin-left: 0.25rem;
  }
  .appr-menu-item .appr-kbd { margin-left: auto; }
`;

// Per-message runtime state, keyed by message id: the document keydown handler
// (re-registered on each render so it binds the freshest approve/deny closures)
// and the "Allow once" popover. Both are torn down when the approval resolves or
// the bubble is rebuilt.
const keyHandlers = new Map();
const popovers = new Map(); // messageId -> PopoverHandle

const teardownMessage = (messageId) => {
  const prevKey = keyHandlers.get(messageId);
  if (prevKey) {
    document.removeEventListener("keydown", prevKey);
    keyHandlers.delete(messageId);
  }
  const popover = popovers.get(messageId);
  if (popover) {
    popover.destroy();
    popovers.delete(messageId);
  }
};

const formatParams = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

// Optional favicon-service fallback (opt in via `faviconService: true`). Guesses
// a `<source>.com` domain from the source label and asks Google's favicon
// service — demo-grade, and it leaks the source to a third party, which is why
// it's off by default in favor of the explicit `icons` map. `size` requests a
// higher-resolution favicon (the box renders ~20px, so 64 stays sharp on 2x/3x
// displays); the service returns the nearest available size.
const faviconUrl = (source, size) => {
  const domain = `${String(source).toLowerCase().replace(/\s+/g, "")}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
};

// Build the icon resolver from plugin options: an explicit `icons` map entry
// wins, then the optional favicon service, else `null` → default tool icon.
const makeResolveIcon = ({ icons, faviconService, faviconSize }) => (source) => {
  if (!source) return null;
  if (icons[source]) return icons[source];
  if (faviconService) return faviconUrl(source, faviconSize);
  return null;
};

// Inlined Lucide icons (lucide.dev, ISC) so the plugin keeps its single
// dependency. SVG chevrons (not the "⌄" text glyph) center predictably in their
// box — the glyph's ink sits high in its line box, so flex-centering it looks
// off. The viewBox-centered path fixes the caret/header alignment.
const svgIcon = (markup) => {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup;
  return tpl.content.firstElementChild;
};

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

// Lucide "wrench" — the default icon when no source icon is configured/resolved.
const toolIcon = () =>
  svgIcon(
    `${SVG_OPEN}<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`
  );

// Lucide "chevron-down" — the header collapse affordance and the split caret.
const chevronIcon = () => svgIcon(`${SVG_OPEN}<path d="m6 9 6 6 6-6"/></svg>`);

// Lucide "ban" — the denied/timeout trace.
const deniedIcon = () =>
  svgIcon(`${SVG_OPEN}<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`);

const kbd = (label) => {
  const el = document.createElement("span");
  el.className = "appr-kbd";
  el.textContent = label;
  return el;
};

// Resolved (non-approved) trace: a subtle one-line "[icon] {tool} denied" row.
// Approved approvals render nothing — the tool call takes over the transcript.
const buildResolved = (approval) => {
  const row = document.createElement("div");
  row.className = "appr-resolved";
  row.appendChild(deniedIcon());
  const name = document.createElement("span");
  name.className = "appr-resolved-name";
  name.textContent = approval.toolName;
  const word = approval.status === "timeout" ? " timed out" : " denied";
  row.append(name, document.createTextNode(word));
  return row;
};

const buildPending = (approval, approve, deny, messageId, resolveIcon) => {
  const card = document.createElement("div");
  card.className = "appr-card";

  const hasParams = approval.parameters != null;
  // `toolType` is a free-form string on the approval; the demo uses it as the
  // source label ("from Runtype"). Skip the internal WebMCP marker.
  const source =
    approval.toolType && approval.toolType !== "webmcp" ? approval.toolType : null;

  // Header. Clicking it collapses/expands the parameters (when present).
  const head = document.createElement("button");
  head.type = "button";
  head.className = "appr-head";
  if (hasParams) {
    head.setAttribute("data-action", "toggle-params");
    // Parameters are shown expanded by default; the header collapses them.
    head.setAttribute("aria-expanded", "true");
  } else {
    head.setAttribute("data-static", "true");
  }

  // 24px icon box. `resolveIcon` returns an explicit URL (config `icons` map,
  // or the optional favicon service); with no URL — or if the image fails to
  // load — we fall back to the default tool icon.
  const logo = document.createElement("span");
  logo.className = "appr-logo";
  const iconUrl = resolveIcon(source);
  if (iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.src = iconUrl;
    img.addEventListener("error", () => {
      logo.replaceChildren(toolIcon());
    });
    logo.appendChild(img);
  } else {
    logo.appendChild(toolIcon());
  }
  head.appendChild(logo);

  const title = document.createElement("span");
  title.className = "appr-title";
  const tool = document.createElement("strong");
  tool.textContent = approval.toolName;
  title.append("BotName wants to use ", tool);
  if (source) {
    const src = document.createElement("strong");
    src.textContent = source;
    title.append(" from ", src);
  }
  // Inline collapse/expand chevron, right after the title text.
  if (hasParams) {
    const toggle = document.createElement("span");
    toggle.className = "appr-toggle";
    toggle.setAttribute("aria-hidden", "true");
    toggle.appendChild(chevronIcon());
    title.append(" ", toggle);
  }
  head.appendChild(title);

  card.appendChild(head);

  // Body: parameters + actions, indented under the title text.
  const body = document.createElement("div");
  body.className = "appr-body";

  // Parameters block — expanded by default to mirror the reference UX.
  if (hasParams) {
    const pre = document.createElement("pre");
    pre.className = "appr-params";
    pre.setAttribute("data-role", "params");
    pre.textContent = formatParams(approval.parameters);
    body.appendChild(pre);
  }

  // Actions.
  const actions = document.createElement("div");
  actions.className = "appr-actions";

  const split = document.createElement("div");
  split.className = "appr-split";

  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "appr-primary";
  primary.setAttribute("data-action", "always");
  primary.append("Always allow", kbd("⏎"));

  const caret = document.createElement("button");
  caret.type = "button";
  caret.className = "appr-caret";
  caret.setAttribute("data-action", "toggle-menu");
  caret.setAttribute("aria-label", "More options");
  caret.appendChild(chevronIcon());

  split.append(primary, caret);

  const no = document.createElement("button");
  no.type = "button";
  no.className = "appr-deny";
  no.setAttribute("data-action", "deny");
  no.append("Deny", kbd("Esc"));

  actions.append(split, no);
  body.appendChild(actions);
  card.appendChild(body);

  // "Allow once" menu. `createPopover` portals it out of the transcript (so it
  // overlays above the rest of the UI and isn't clipped by the scroll
  // container), positions it under the split control, and handles outside-click
  // dismiss + scroll/resize reposition. The menu carries its own click listener
  // since it lives outside the card (the card's delegated listener wouldn't
  // catch it).
  const menu = document.createElement("div");
  menu.className = "appr-menu";
  const once = document.createElement("button");
  once.type = "button";
  once.className = "appr-menu-item";
  once.append("Allow once", kbd("⌘⏎"));
  menu.appendChild(once);

  const popover = createPopover({
    anchor: split,
    content: menu,
    placement: "bottom-start",
    matchAnchorWidth: true,
  });
  popovers.set(messageId, popover);

  once.addEventListener("click", () => {
    popover.close();
    approve(); // Allow once
  });

  // Single delegated click listener for the in-card actions — survives morph
  // passes via the stub-and-hydrate path.
  card.addEventListener("click", (e) => {
    const liveRoot = e.currentTarget;
    const target = e.target instanceof Element ? e.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");

    if (action === "toggle-params") {
      const pre = liveRoot.querySelector('[data-role="params"]');
      const headEl = liveRoot.querySelector(".appr-head");
      if (pre) {
        const open = pre.hidden;
        pre.hidden = !open;
        headEl?.setAttribute("aria-expanded", open ? "true" : "false");
      }
      return;
    }
    if (action === "toggle-menu") {
      popover.toggle();
      return;
    }
    if (action === "always") {
      popover.close();
      approve({ remember: true });
      return;
    }
    if (action === "deny") {
      popover.close();
      deny();
      return;
    }
  });

  return card;
};

/**
 * Create the approval-actions plugin.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.icons]
 *   Map of source label (`approval.toolType`) → icon URL, e.g.
 *   `{ Runtype: "/runtype-logo.svg" }`. Checked first; an entry here always wins.
 * @param {boolean} [options.faviconService=false]
 *   When no `icons` entry matches, fall back to Google's favicon service
 *   (guesses `<source>.com`). Off by default — it's demo-grade and leaks the
 *   source label to a third party. With no map entry and this off, the icon box
 *   shows the default tool icon.
 * @param {number} [options.faviconSize=64]
 *   Requested favicon resolution in px for `faviconService`. The box renders
 *   ~20px, so 64 stays crisp on 2x/3x displays; bump to 128 for extra headroom.
 */
export const createApprovalActionsPlugin = (options = {}) => {
  const resolveIcon = makeResolveIcon({
    icons: options.icons ?? {},
    faviconService: options.faviconService === true,
    faviconSize: options.faviconSize ?? 64,
  });

  return {
    id: "example-approval-actions",

    renderApproval: ({ message, approve, deny }) => {
      const approval = message?.approval;
      if (!approval) return null;

      // Resolved approvals: tear down the keyboard handler + popover. Unlike the
      // built-in renderer (which shows a persistent "Approved/Denied" bubble),
      // this plugin owns the resolved state:
      if (approval.status !== "pending") {
        teardownMessage(message.id);
        // Approved → render nothing; the tool call takes over the transcript.
        // (Returning an empty element — not null — suppresses the built-in.)
        if (approval.status === "approved") {
          const hidden = document.createElement("div");
          hidden.style.display = "none";
          return hidden;
        }
        // Denied / timeout → a subtle one-line trace.
        const row = buildResolved(approval);
        injectStyles(row, STYLE_ID, STYLE_CSS);
        return row;
      }

      // Tear down any prior runtime state for this message, then (re)bind the
      // keyboard shortcuts to the freshest callbacks.
      teardownMessage(message.id);
      const onKeydown = (e) => {
        if (isEditableEventTarget(e)) return;
        if (e.key === "Escape") {
          e.preventDefault();
          teardownMessage(message.id);
          deny();
        } else if (e.key === "Enter") {
          e.preventDefault();
          teardownMessage(message.id);
          if (e.metaKey || e.ctrlKey) {
            approve(); // Allow once
          } else {
            approve({ remember: true }); // Always allow
          }
        }
      };

      const card = buildPending(approval, approve, deny, message.id, resolveIcon);
      // Shadow-DOM-safe: injects into the card's shadow root when the widget runs
      // shadowed, the document head otherwise. Idempotent across re-renders.
      injectStyles(card, STYLE_ID, STYLE_CSS);
      // buildPending registers the popover; attach the keydown handler after so
      // teardownMessage above didn't clear it.
      keyHandlers.set(message.id, onKeydown);
      document.addEventListener("keydown", onKeydown);

      return card;
    },
  };
};

// Default instance: monogram icon box, no external favicon service. For an
// explicit icon or the favicon fallback, use createApprovalActionsPlugin().
export const approvalActionsPlugin = createApprovalActionsPlugin();
