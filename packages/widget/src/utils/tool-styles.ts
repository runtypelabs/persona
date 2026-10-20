import { getExplicitLegacyStyle, hasExplicitThemeStyle } from "./style-provenance";
import { createToolStyleResolvers } from "./tool-style-resolvers";

/** Standalone users bind directly; optional activity chunks reuse core helpers. */
export const { resolveToolStyles, applyToolPadding, toolLoadingDuration } =
  createToolStyleResolvers({ getExplicitLegacyStyle, hasExplicitThemeStyle });
