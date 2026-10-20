import { defaultProvenance, suppliedPath } from "./utils/defaults-provenance";
import { getExplicitLegacyStyle, hasExplicitThemeStyle } from "./utils/style-provenance";

/** Share core's style/provenance functions with the optional rendering chunks. */
export const activityDependencies = { defaultProvenance, suppliedPath, hasExplicitThemeStyle, getExplicitLegacyStyle };
export type ActivityDependencies = typeof activityDependencies;
