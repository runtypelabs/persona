import { createChunkLoader } from "./utils/chunk-loader";
export type ComposerActionsModule = typeof import("./composer-actions-runtime");
const { setLoader, load, provide, getSync } = createChunkLoader<ComposerActionsModule>({
  fallbackImport: () => import("@runtypelabs/persona/composer-actions-runtime"),
});
export const setComposerActionsLoader = setLoader;
export const loadComposerActions = load;
export const provideComposerActions = provide;
export const getComposerActionsSync = getSync;
