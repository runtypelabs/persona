import { createChunkLoader } from "./utils/chunk-loader";
import type * as LiveInput from "./live-input";
const { setLoader, load } = createChunkLoader<typeof LiveInput>({
  fallbackImport: () => import("@runtypelabs/persona/live-input"),
});
export const setLiveInputLoader = setLoader;
export const loadLiveInput = load;
