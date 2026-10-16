import { createChunkLoader } from "./utils/chunk-loader";
export type ClientDispatchModule = typeof import("./client-dispatch");
const { setLoader, load, provide, getSync } = createChunkLoader<ClientDispatchModule>({
  fallbackImport: () => import("./client-dispatch"),
});
export const setClientDispatchLoader = setLoader;
export const loadClientDispatch = load;
export const provideClientDispatch = provide;
export const getClientDispatchSync = getSync;
