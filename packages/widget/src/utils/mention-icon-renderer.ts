/**
 * Injected string-name icon resolver for the context-mentions chunk.
 *
 * Chip and menu icons come from mention PROVIDERS as runtime name strings, so
 * they need the string registry — but this chunk is bundled `noExternal`, and
 * importing `./icons` here would duplicate the whole ~21 kB registry into it.
 * The orchestrator (core) injects core's `renderLucideIcon` via
 * `setMentionIconRenderer` immediately after the chunk loads, before any chip
 * or menu can render. Without injection (direct mounts in tests), icons
 * degrade to none, the same as an unknown registry name.
 */
export type MentionIconRenderer = (
  iconName: string,
  size?: number | string,
  color?: string,
  strokeWidth?: number
) => SVGElement | null;

let mentionIconRenderer: MentionIconRenderer | null = null;

export const setMentionIconRenderer = (renderer: MentionIconRenderer): void => {
  mentionIconRenderer = renderer;
};

export const renderMentionIcon: MentionIconRenderer = (
  iconName,
  size,
  color,
  strokeWidth
) => mentionIconRenderer?.(iconName, size, color, strokeWidth) ?? null;
