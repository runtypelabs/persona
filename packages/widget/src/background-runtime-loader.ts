import { createChunkLoader } from "./utils/chunk-loader";
export type BackgroundRuntimeModule = typeof import("./background-runtime");
const { setLoader, load } = createChunkLoader<BackgroundRuntimeModule>({
  fallbackImport: () => import("@runtypelabs/persona/background-runtime"),
});
export const setBackgroundRuntimeLoader = setLoader;
export const loadBackgroundRuntime = load;
