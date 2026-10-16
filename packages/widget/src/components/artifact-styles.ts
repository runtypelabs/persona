import css from "../styles/artifacts.css?raw";
import { injectStyles } from "../plugin-kit";
/** Artifact styles travel with the renderer, including into shadow roots. */
export const ensureArtifactStyles = (target: Node): void => injectStyles(target, "artifacts", css);
