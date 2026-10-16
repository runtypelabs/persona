import { createChunkLoader } from "./utils/chunk-loader";
export type ActivityUiModule = typeof import("./activity-ui");
const { setLoader, load, provide, getSync } = createChunkLoader<ActivityUiModule>({
  fallbackImport: () => import("@runtypelabs/persona/activity-ui"),
});
export const setActivityUiLoader = setLoader;
export const loadActivityUi = load;
export const provideActivityUi = provide;
export const getActivityUiSync = getSync;
