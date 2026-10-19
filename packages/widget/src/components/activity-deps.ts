import type { renderLucideIcon as RenderIcon } from "../utils/icons";
import type { LoadingLabelRuntime } from "../loading-label-runtime-loader";
import { initLoadingLabelRuntime } from "../utils/loading-label-deps";
import type { ActivityDependencies } from "../activity-dependencies";
import { createToolStyleResolvers } from "../utils/tool-style-resolvers";
let renderIcon: typeof RenderIcon | undefined;
// Required before rendering, like the icon and shared loading-label runtime.
const missingStyles = (): never => { throw new Error("Activity UI requires core style dependencies."); };
let styles: ActivityDependencies | undefined;
export const getActivityStyles = (): ActivityDependencies => styles ?? missingStyles();
export let resolveToolStyles: ReturnType<typeof createToolStyleResolvers>["resolveToolStyles"] = missingStyles;
export let applyToolPadding: ReturnType<typeof createToolStyleResolvers>["applyToolPadding"] = missingStyles;
export const initActivityUi = (icon: typeof RenderIcon, loadingLabels: LoadingLabelRuntime, dependencies: ActivityDependencies): void => {
  styles = dependencies;
  ({ resolveToolStyles, applyToolPadding } = createToolStyleResolvers(dependencies));
  renderIcon = icon; initLoadingLabelRuntime(loadingLabels);
};
export const renderLucideIcon: typeof RenderIcon = (...args) => renderIcon?.(...args) ?? null;

/** Shared bridge, initialized only after both optional chunks are ready. */
export const turnUi: Partial<import("../turn-activity-ui").TurnActivityRuntime> = {};
