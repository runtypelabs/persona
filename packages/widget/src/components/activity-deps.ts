import type { renderLucideIcon as RenderIcon } from "../utils/icons";
let renderIcon: typeof RenderIcon | undefined;
export const initActivityUi = (icon: typeof RenderIcon): void => { renderIcon = icon; };
export const renderLucideIcon: typeof RenderIcon = (...args) => renderIcon?.(...args) ?? null;
