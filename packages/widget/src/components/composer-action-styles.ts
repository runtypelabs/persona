import css from "../styles/composer-menu.css?raw";
import { injectStyles } from "../plugin-kit";
export const ensureComposerActionStyles = (target: HTMLElement) => injectStyles(target, "composer-actions", css);
