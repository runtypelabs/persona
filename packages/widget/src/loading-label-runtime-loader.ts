import { createChunkLoader } from "./utils/chunk-loader";
import type { applyLoadingLabel } from "./utils/loading-label";
import type { createLoadingLabelLifecycle } from "./utils/loading-label-lifecycle";
import type { applyLoadingAnimation } from "./utils/tool-loading-animation";

/** Internal contract: resolve/decorate fresh labels, then manage committed hooks.
 * A future renderer replacement must preserve this lifecycle and readiness boundary.
 * Artifact builtin rendering is a separate, deliberate export of the same module.
 */
export type LoadingLabelRuntime = {
  applyLoadingLabel: typeof applyLoadingLabel;
  createLoadingLabelLifecycle: typeof createLoadingLabelLifecycle;
  applyLoadingAnimation: typeof applyLoadingAnimation;
};
const { setLoader, load, provide, getSync } = createChunkLoader<LoadingLabelRuntime>({
  fallbackImport: () => import("@runtypelabs/persona/loading-label-runtime"),
});
export const setLoadingLabelRuntimeLoader = setLoader;
export const loadLoadingLabelRuntime = load;
export const provideLoadingLabelRuntime = provide;
export const getLoadingLabelRuntimeSync = getSync;
