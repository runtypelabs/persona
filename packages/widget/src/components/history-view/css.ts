/**
 * All styles for the Messages view, carried by the lazy history-view chunk and
 * injected on mount (`injectStyles`) rather than shipped in `widget.css`:
 * the eager stylesheet is at its size cap and this surface only ever renders
 * after the chunk loads.
 *
 * Every rule is scoped under `.persona-history-view` (and interactive elements
 * additionally by tag), so demo/host resets such as `[data-persona-root] h2`
 * cannot outrank a single-class widget rule. The one exception is the
 * "shell-hosted top bar" block at the end: those nodes live in the widget's own
 * header, outside the view, so their selectors are doubled up instead.
 *
 * History-specific custom properties, all with a themed fallback chain:
 *   --persona-history-surface-bg    list/background surface
 *   --persona-history-topbar-bg     top bar background
 *   --persona-history-border        hairlines and dividers
 *   --persona-history-row-hover-bg  row hover/active-press wash
 *   --persona-history-row-active-bg selected conversation wash
 *   --persona-history-active-marker selected conversation edge marker
 *   --persona-history-skeleton-bg   loading placeholder blocks
 *   --persona-history-danger-fg     destructive action text
 *   --persona-history-focus-ring    focus-visible outline color
 *   --persona-history-slide         entrance/exit horizontal travel
 *   --persona-history-row-min-height / --persona-history-topbar-min-height
 *
 * Section notes are JS comments between concatenated literals, never CSS
 * comments inside them: the chunk is at its size cap and only JS comments are
 * minified away. Backticks in a note would terminate the literal.
 */

export const HISTORY_VIEW_CSS =
  `
.persona-history-view {
  --persona-history-surface-bg: var(--persona-surface, #ffffff);
  --persona-history-topbar-bg: var(--persona-header-bg, var(--persona-surface, #ffffff));
  --persona-history-border: var(--persona-divider, var(--persona-border, #e5e7eb));
  --persona-history-row-hover-bg: var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.04));
  --persona-history-row-active-bg: var(--persona-container, #f3f4f6);
  --persona-history-active-marker: var(--persona-primary, #2563eb);
  --persona-history-skeleton-bg: var(--persona-container, #eef0f3);
  --persona-history-danger-fg: var(--persona-palette-colors-error-600, #b91c1c);
  --persona-history-focus-ring: var(--persona-primary, #2563eb);
  --persona-history-slide: 20px;
  --persona-history-row-min-height: 72px;
  --persona-history-topbar-min-height: 56px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--persona-history-surface-bg);
  color: var(--persona-text, #111827);
  font-family: var(--persona-font-family, inherit);
  font-size: 14px;
  line-height: 1.45;
  opacity: 1;
}
.persona-history-view *,
.persona-history-view *::before,
.persona-history-view *::after {
  box-sizing: border-box;
}
` +
  /* In-panel navigation, not a sheet: only the body moves, so the bar is never
     animated or replaced. The mirrored exit is playExit() in history-view.ts. */
  `.persona-history-view--enter .persona-history-body {
  animation: persona-history-enter-body 180ms cubic-bezier(0, 0, 0.2, 1) both;
}
@keyframes persona-history-enter-body {
  from { opacity: 0; transform: translateX(var(--persona-history-slide)); }
  to { opacity: 1; transform: none; }
}
` +
  /* Ambient identity states collapse to the caption above the list; the sentence
     stays in the accessibility tree for its aria-describedby. */
  `.persona-history-view .persona-history-sr-only,
.persona-history-view .persona-history-scope-alert[data-persona-history-scope-tone="ambient"] {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

` +
  /* --- top bar ------------------------------------------------------------ */
  /* --shell = the same bar hosted in the widget's own header (block below). */
  `.persona-history-view .persona-history-topbar,
.persona-history-topbar.persona-history-topbar--shell {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 4px;
}
.persona-history-view .persona-history-topbar {
  min-height: var(--persona-history-topbar-min-height);
  padding: 6px 8px;
  background: var(--persona-history-topbar-bg);
  border-bottom: 1px solid var(--persona-history-border);
}
.persona-history-view .persona-history-heading-group,
.persona-history-topbar--shell .persona-history-heading-group {
  min-width: 0;
  text-align: center;
}
.persona-history-view .persona-history-title,
.persona-history-topbar--shell .persona-history-title {
  margin: 0;
  padding: 0;
  font-size: var(--persona-components-header-title-fontSize, 1rem);
  font-weight: var(--persona-components-header-title-fontWeight, 600);
  line-height: var(--persona-components-header-title-lineHeight, 1.5rem);
  color: var(--persona-header-title-fg, var(--persona-primary, #0f0f0f));
  overflow-wrap: anywhere;
}
` +
  /* Ambient privacy caption: a body row above the list, never a second bar line. */
  `.persona-history-view .persona-history-scope {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--persona-text-muted, #6b7280);
  overflow-wrap: anywhere;
}
.persona-history-view .persona-history-scope-description {
  display: block;
}
.persona-history-view .persona-history-scope-alert {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--persona-history-border);
  border-radius: var(--persona-radius-md, 8px);
  font-size: 12px;
  color: var(--persona-text-muted, #6b7280);
}
.persona-history-view .persona-history-scope-alert-title {
  display: block;
  font-weight: 600;
  color: var(--persona-text, #111827);
}

` +
  /* --- shared controls ---------------------------------------------------- */
  `.persona-history-view button.persona-history-icon-button,
.persona-history-topbar--shell button.persona-history-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: var(--persona-button-ghost-radius, var(--persona-radius-md, 8px));
  background: transparent;
  color: var(--persona-header-action-icon-fg, var(--persona-text-muted, #6b7280));
  cursor: pointer;
}
.persona-history-view button.persona-history-icon-button:hover:not(:disabled),
.persona-history-topbar--shell button.persona-history-icon-button:hover:not(:disabled) {
  background: var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.04));
}
.persona-history-view button:focus-visible,
.persona-history-view [role="menuitem"]:focus-visible,
.persona-history-topbar--shell button:focus-visible {
  outline: 2px solid var(--persona-history-focus-ring, var(--persona-primary, #2563eb));
  outline-offset: 2px;
}
.persona-history-view button:disabled {
  opacity: 0.55;
  cursor: default;
}

` +
  /* --- body / regions ----------------------------------------------------- */
  `.persona-history-view .persona-history-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.persona-history-view button.persona-history-new {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 12px 16px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--persona-button-radius, var(--persona-radius-lg, 10px));
  background: var(--persona-button-primary-bg, var(--persona-primary, #2563eb));
  color: var(--persona-button-primary-fg, var(--persona-text-inverse, #ffffff));
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.persona-history-view button.persona-history-new span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.persona-history-view .persona-history-list-region {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

` +
  /* --- groups and rows ---------------------------------------------------- */
  `.persona-history-view .persona-history-group-heading {
  margin: 0 0 4px;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--persona-text-muted, #6b7280);
}
.persona-history-view ul.persona-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.persona-history-view li.persona-history-item {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.persona-history-view li.persona-history-item + li.persona-history-item {
  border-top: 1px solid var(--persona-history-border);
}
.persona-history-view button.persona-history-row {
  display: block;
  width: 100%;
  min-height: var(--persona-history-row-min-height);
  padding: 12px 60px 12px 16px;
  margin: 0;
  border: 0;
  border-radius: var(--persona-radius-md, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.persona-history-view button.persona-history-row:hover:not(:disabled) {
  background: var(--persona-history-row-hover-bg);
}
.persona-history-view button.persona-history-row[aria-current="page"] {
  background: var(--persona-history-row-active-bg);
  box-shadow: inset 3px 0 0 0 var(--persona-history-active-marker);
  font-weight: 600;
}
.persona-history-view .persona-history-row-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.persona-history-view .persona-history-row-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--persona-text-muted, #6b7280);
}
.persona-history-view .persona-history-truncate {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-history-view time.persona-history-row-time {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--persona-text-muted, #6b7280);
}
.persona-history-view .persona-history-row-preview {
  margin-top: 2px;
  font-size: 14px;
  color: var(--persona-text, #111827);
}
.persona-history-view .persona-history-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.persona-history-view button.persona-history-row-menu-button {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
}
.persona-history-view .persona-history-menu {
  position: absolute;
  top: calc(50% + 20px);
  right: 8px;
  z-index: 2;
  min-width: 160px;
  max-width: calc(100% - 16px);
  padding: 4px;
  border: 1px solid var(--persona-history-border);
  border-radius: var(--persona-radius-md, 8px);
  background: var(--persona-history-surface-bg);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
}
.persona-history-view button.persona-history-menu-item {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--persona-radius-sm, 6px);
  background: transparent;
  color: var(--persona-history-danger-fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.persona-history-view button.persona-history-menu-item:hover:not(:disabled) {
  background: var(--persona-history-row-hover-bg);
}
.persona-history-view .persona-history-row-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 12px;
  font-size: 13px;
  color: var(--persona-history-danger-fg);
}

` +
  /* --- pagination, states, footer ----------------------------------------- */
  `.persona-history-view button.persona-history-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 10px 16px;
  margin: 0;
  border: 1px solid var(--persona-history-border);
  border-radius: var(--persona-button-radius, var(--persona-radius-lg, 10px));
  background: transparent;
  color: var(--persona-text, #111827);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.persona-history-view button.persona-history-secondary:hover:not(:disabled) {
  background: var(--persona-history-row-hover-bg);
}
.persona-history-view .persona-history-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px;
}
.persona-history-view .persona-history-state-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--persona-text, #111827);
}
.persona-history-view .persona-history-state-description {
  margin: 0;
  font-size: 13px;
  color: var(--persona-text-muted, #6b7280);
  overflow-wrap: anywhere;
}
.persona-history-view button.persona-history-state-action {
  width: auto;
  min-width: 44px;
}
.persona-history-view .persona-history-view-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.persona-history-view .persona-history-skeleton-row {
  min-height: var(--persona-history-row-min-height);
  padding: 12px 16px;
}
.persona-history-view .persona-history-skeleton-bar {
  height: 10px;
  border-radius: 999px;
  background: var(--persona-history-skeleton-bg);
  animation: persona-history-pulse 1400ms ease-in-out infinite;
}
.persona-history-view .persona-history-skeleton-bar + .persona-history-skeleton-bar {
  margin-top: 10px;
}
.persona-history-view .persona-history-skeleton-bar--short { width: 40%; }
.persona-history-view .persona-history-skeleton-bar--wide { width: 88%; }
.persona-history-view .persona-history-skeleton-bar--medium { width: 64%; }
@keyframes persona-history-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.persona-history-view .persona-history-footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--persona-history-border);
}
.persona-history-view button.persona-history-destructive {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 4px;
  margin: 0;
  border: 0;
  background: transparent;
  color: var(--persona-history-danger-fg);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.persona-history-view button.persona-history-destructive:hover:not(:disabled) {
  text-decoration: underline;
}

` +
  /* --- rail presentation --------------------------------------------------- */
  `.persona-history-view--rail {
  --persona-history-slide: 12px;
  /* The rail occupies the trailing edge; the divider faces the conversation. */
  border-left: 1px solid var(--persona-history-border);
}

` +
  /* --- shell-hosted top bar ------------------------------------------------ */
  /* Panel keeps ONE bar: the shell header stays, its own children are suppressed,
     and this bar mounts inside it. Unscoped: these nodes are outside the view. */
  `[data-persona-history-suppressed] { display: none !important; }
.persona-history-header-host {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}
` +
  /* The header supplies padding and background; the bar only fills it. */
  `.persona-history-topbar.persona-history-topbar--shell {
  flex: 1 1 auto;
  min-width: 0;
}
` +
  /* The bar never animates; only its arrival in the shell header does. */
  `.persona-history-topbar--shell.persona-history-topbar--shell-enter {
  animation: persona-history-header-fade 120ms cubic-bezier(0, 0, 0.2, 1) both;
}
@keyframes persona-history-header-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .persona-history-view--enter .persona-history-body { animation: none; }
  .persona-history-topbar--shell.persona-history-topbar--shell-enter {
    animation: none;
  }
  .persona-history-view .persona-history-skeleton-bar { animation: none; }
}
`;