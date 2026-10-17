import type { LoadingLabelRuntime } from "../loading-label-runtime-loader";

/** Each lazy renderer receives the SAME runtime. This adapter owns no effects
 * or handles; only the runtime creates per-widget lifecycles after commit.
 * Injection avoids static chunk dependencies so failed downloads remain retryable.
 */
let runtime: LoadingLabelRuntime | undefined;
export const initLoadingLabelRuntime = (value: LoadingLabelRuntime): void => { runtime = value; };
export const applyLoadingLabel: LoadingLabelRuntime["applyLoadingLabel"] = (...args) => runtime?.applyLoadingLabel(...args);
export const applyLoadingAnimation: LoadingLabelRuntime["applyLoadingAnimation"] = (...args) => runtime?.applyLoadingAnimation(...args);
