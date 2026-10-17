import type { renderLucideIcon as RenderIcon } from "../utils/icons";
import type { LoadingLabelRuntime } from "../loading-label-runtime-loader";
import { initLoadingLabelRuntime } from "../utils/loading-label-deps";
let renderIcon: typeof RenderIcon | undefined;
export const initActivityUi = (icon: typeof RenderIcon, loadingLabels: LoadingLabelRuntime): void => {
  renderIcon = icon; initLoadingLabelRuntime(loadingLabels);
};
export const renderLucideIcon: typeof RenderIcon = (...args) => renderIcon?.(...args) ?? null;
