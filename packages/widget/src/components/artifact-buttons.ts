import { getArtifactButtons } from "./artifacts-deps";
export type { SplitButtonHandle } from "../utils/buttons";
export const createIconButton: typeof import("../utils/buttons").createIconButton = (...args) => getArtifactButtons().createIconButton(...args);
export const createLabelButton: typeof import("../utils/buttons").createLabelButton = (...args) => getArtifactButtons().createLabelButton(...args);
export const createSplitButton: typeof import("../utils/buttons").createSplitButton = (...args) => getArtifactButtons().createSplitButton(...args);
export const createToggleGroup: typeof import("../utils/buttons").createToggleGroup = (...args) => getArtifactButtons().createToggleGroup(...args);
