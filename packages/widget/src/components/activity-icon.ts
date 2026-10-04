/**
 * Injected string-name icon resolver for the lazy activity-ui chunk (tool and
 * reasoning bubbles, activity rows, tool details).
 *
 * Several of those icons are runtime name strings (e.g.
 * `features.reasoningDisplay.iconName`, which may name a host-registered
 * icon), so they need core's icon registry. The chunk is bundled `noExternal`,
 * so importing `../utils/icons` here would duplicate the registry into it and
 * miss icons the host registered on core's copy. ui.ts injects core's
 * `renderLucideIcon` via `initActivityUi` when it adopts the chunk, before any
 * activity bubble renders. Without injection (direct mounts in tests), icons
 * degrade to none, the same as an unknown registry name.
 */
export type ActivityIconRenderer = (
  iconName: string,
  size?: number | string,
  color?: string,
  strokeWidth?: number
) => SVGElement | null;

let activityIconRenderer: ActivityIconRenderer | null = null;

export const setActivityIconRenderer = (renderer: ActivityIconRenderer): void => {
  activityIconRenderer = renderer;
};

export const renderActivityIcon: ActivityIconRenderer = (
  iconName,
  size,
  color,
  strokeWidth
) => activityIconRenderer?.(iconName, size, color, strokeWidth) ?? null;
