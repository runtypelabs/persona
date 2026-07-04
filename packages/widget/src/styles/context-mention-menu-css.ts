/**
 * CSS for the context-mention MENU (floating popover): search field, grouped
 * result list, options, status/empty/error rows, retry button, and the
 * coarse-pointer touch sizing for its rows.
 *
 * This lives in the lazy `context-mentions` chunk (not `widget.css`) and is
 * injected on first menu open via `injectStyles`. Two reasons:
 *   1. it keeps ~1 kB of menu-only CSS out of the eager core stylesheet;
 *   2. the menu mounts into the popover container (document.body by default),
 *      which is OUTSIDE a `useShadowDom` widget's shadow root — where the
 *      shadow-scoped `widget.css` never reached it. Injecting at mount time puts
 *      the rules in whichever root the menu actually lives in.
 *
 * The chip / context-row / affordance-button rules stay in `widget.css`: they
 * render eagerly (restored-message chips, the always-visible add-context button)
 * before this chunk loads.
 */
export const MENTION_MENU_CSS = `
.persona-mention-menu {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-height: var(--persona-mention-menu-max-height, 280px);
  overflow: hidden;
  background: var(--persona-mention-menu-bg, var(--persona-surface, #ffffff));
  border: 1px solid var(--persona-mention-menu-border, var(--persona-border, #e5e7eb));
  border-radius: var(--persona-mention-menu-radius, 10px);
  box-shadow: var(--persona-mention-menu-shadow, 0 8px 28px rgba(0, 0, 0, 0.12));
  font-family: var(--persona-font-family, inherit);
}
.persona-mention-list {
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
}
.persona-mention-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--persona-mention-menu-border, var(--persona-border, #e5e7eb));
}
.persona-mention-search-icon {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--persona-mention-group-fg, var(--persona-muted, #6b7280));
}
.persona-mention-search-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  /* 16px, not 14px: iOS Safari zooms the page when focusing an input under 16px. */
  font-size: 16px;
  line-height: 1.4;
  color: var(--persona-text, #111827);
}
.persona-mention-search-input::placeholder {
  color: var(--persona-mention-group-fg, var(--persona-muted, #6b7280));
}
.persona-mention-group + .persona-mention-group {
  margin-top: 2px;
  border-top: 1px solid var(--persona-mention-menu-border, var(--persona-border, #f1f1f1));
  padding-top: 2px;
}
.persona-mention-group-header {
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--persona-mention-group-fg, var(--persona-muted, #6b7280));
}
.persona-mention-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--persona-text, #111827);
}
.persona-mention-option[data-active="true"] {
  background: var(--persona-mention-option-active-bg, var(--persona-container, #f1f5f9));
}
.persona-mention-option-icon {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  opacity: 0.7;
}
.persona-mention-option-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.persona-mention-option-labelline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.persona-mention-option-label {
  font-size: 13px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-mention-option-arghint {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 1.3;
  color: var(--persona-muted, #6b7280);
  opacity: 0.85;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.persona-mention-option-desc {
  font-size: 11px;
  line-height: 1.3;
  color: var(--persona-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-mention-status,
.persona-mention-empty,
.persona-mention-hint {
  padding: 7px 8px;
  font-size: 12px;
  color: var(--persona-muted, #6b7280);
}
.persona-mention-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--persona-mention-error, #dc2626);
}
.persona-mention-error-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-mention-retry {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--persona-mention-error, #dc2626);
  border-radius: 6px;
  background: transparent;
  color: var(--persona-mention-error, #dc2626);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.persona-mention-retry:hover {
  background: var(--persona-palette-colors-black-alpha-50, rgba(0, 0, 0, 0.06));
}
.persona-mention-hint {
  font-style: italic;
  opacity: 0.8;
}
@media (pointer: coarse) {
  .persona-mention-option {
    min-height: 44px;
  }
  .persona-mention-retry {
    min-height: 36px;
  }
}
`;
