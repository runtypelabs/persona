import { createChunkLoader } from "./utils/chunk-loader";
const { setLoader, load, provide, getSync } = createChunkLoader<typeof import("./config-diagnostics")>({
  fallbackImport: () => import("@runtypelabs/persona/config-diagnostics"),
});
export const setConfigDiagnosticsLoader = setLoader;
export const loadConfigDiagnostics = load;
export const provideConfigDiagnostics = provide;
export const getConfigDiagnosticsSync = getSync;
