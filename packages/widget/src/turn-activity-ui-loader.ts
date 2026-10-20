import { loadActivityUi } from "./activity-ui-loader";
import { createChunkLoader } from "./utils/chunk-loader";
export type TurnActivityUiModule = import("./turn-activity-ui").TurnActivityRuntime;
const { setLoader, load, provide } = createChunkLoader<TurnActivityUiModule>({
  fallbackImport: () => import("@runtypelabs/persona/turn-activity-ui"),
});
export const setTurnActivityUiLoader = setLoader;
let ready: TurnActivityUiModule | null = null;
export const loadTurnActivityUi = () => Promise.all([load(), loadActivityUi()]).then(([turn, activity]) => {
  Object.assign(activity.turnUi, turn);
  return ready = turn;
});
export const provideTurnActivityUi = provide;
export const getTurnActivityUiSync = () => ready;
