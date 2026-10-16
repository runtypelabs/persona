import { createChunkLoader } from "./utils/chunk-loader";
export type DictationRuntimeModule = typeof import("./dictation-runtime");
const { setLoader, load, getSync, provide } = createChunkLoader<DictationRuntimeModule>({
  fallbackImport: () => import("@runtypelabs/persona/dictation-runtime"),
});
export const setDictationRuntimeLoader = setLoader;
export const loadDictationRuntime = load;
export const getDictationRuntimeSync = getSync;
export const provideDictationRuntime = provide;
