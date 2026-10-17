import type { BrandConfig } from "../types/theme";
import { inferBrandColorScheme } from "./brand";
import { suppliedPath } from "./defaults-provenance";

const paths = (prefix: string, leaves: string): string[] =>
  leaves.split(" ").map((leaf) => `${prefix}.${leaf}`);

/** Only the style aliases covered by the replacement plan carry origin data. */
export const LEGACY_STYLE_PATHS: readonly string[] = /* @__PURE__ */ (() => [
  ...paths("launcher", "closeButtonSize closeButtonColor closeButtonBackgroundColor closeButtonBorderWidth closeButtonBorderColor closeButtonBorderRadius closeButtonPaddingX closeButtonPaddingY"),
  ...paths("launcher.clearChat", "size iconColor backgroundColor borderWidth borderColor borderRadius paddingX paddingY"),
  ...paths("sendButton", "size iconSize iconStrokeWidth backgroundColor textColor borderWidth borderColor paddingX paddingY"),
  ...paths("voiceRecognition", "iconSize iconColor backgroundColor borderColor borderWidth paddingX paddingY recordingIconColor recordingBackgroundColor recordingBorderColor processingIconColor processingBackgroundColor processingBorderColor speakingIconColor speakingBackgroundColor speakingBorderColor"),
  ...paths("toolCall", "shadow backgroundColor borderColor borderWidth borderRadius headerBackgroundColor headerTextColor headerPaddingX headerPaddingY contentBackgroundColor contentTextColor contentPaddingX contentPaddingY codeBlockBackgroundColor codeBlockBorderColor codeBlockTextColor toggleTextColor labelTextColor loadingAnimationColor loadingAnimationSecondaryColor loadingAnimationDuration"),
  ...paths("approval", "backgroundColor borderColor shadow titleColor descriptionColor reasonColor approveButtonColor approveButtonTextColor denyButtonColor denyButtonTextColor parameterBackgroundColor parameterTextColor"),
  ...paths("features.askUserQuestion.styles", "sheetBackground sheetBorder sheetShadow pillBackground pillBackgroundSelected pillTextColor pillTextColorSelected pillBorderRadius customInputBackground"),
  ...paths("features.artifacts.layout", "paneBackground panePadding paneBorderRadius paneShadow chatShadow paneBorder paneBorderLeft unifiedSplitOuterRadius documentToolbarIconColor documentToolbarToggleActiveBackground documentToolbarToggleActiveBorderColor documentToolbarToggleActiveColor tabFadeSize"),
  ...paths("suggestionChipsConfig", "fontWeight paddingX paddingY"),
])();

/** Existing emitted tokens whose newly wired consumers must remain opt-in. */
export const OPT_IN_THEME_STYLE_PATHS: readonly string[] = [
  "voice.recording.border", "voice.processing.icon", "voice.processing.background", "voice.speaking.icon",
  "approval.requested.text", "approval.approve.foreground", "approval.deny.foreground", "approval.deny.background",
];
const TRACKED_PATHS = /* @__PURE__ */ (() => [
  ...LEGACY_STYLE_PATHS,
  "suggestionChips", "copy.welcomeTitle", "copy.welcomeSubtitle", "copy.showWelcomeCard",
  "features.suggestReplies.enabled", "features.suggestReplies.expose",
  ...["theme", "darkTheme"].flatMap((group) =>
    OPT_IN_THEME_STYLE_PATHS.map((path) => `${group}.components.${path}`)),
])();
const STYLE_PROVENANCE = Symbol.for("persona.styleProvenance");
type Origin = { explicit: readonly string[]; values: Readonly<Record<string, unknown>> };
type Marked = { [STYLE_PROVENANCE]?: Origin };
export const hasStyleProvenance = (config: object): boolean =>
  (config as Marked)[STYLE_PROVENANCE] !== undefined;

const valueAt = (config: unknown, path: string): unknown => {
  for (const key of path.split(".")) {
    if (typeof config !== "object" || config === null) return undefined;
    config = (config as Record<string, unknown>)[key];
  }
  return config;
};

const origin = (config?: object): readonly string[] => {
  const stored = (config as Marked | undefined)?.[STYLE_PROVENANCE];
  if (!stored) return TRACKED_PATHS.filter((path) => suppliedPath(config, path) === "explicit");
  // A spread retains the symbol. Changes made on that copy are still host
  // input: compare with its recorded values, never with built-in defaults.
  const explicit = new Set(stored.explicit);
  TRACKED_PATHS.forEach((path) => {
    if (valueAt(config, path) === stored.values[path]) return;
    if (suppliedPath(config, path) === "explicit") explicit.add(path);
    else explicit.delete(path);
  });
  return [...explicit];
};

export const setStyleProvenance = <T extends object>(config: T, explicit: readonly string[]): T => {
  Object.defineProperty(config, STYLE_PROVENANCE, {
    value: { explicit, values: Object.fromEntries(TRACKED_PATHS.map((path) => [path, valueAt(config, path)])) },
    enumerable: true, configurable: true,
  });
  return config;
};

export const inheritStyleProvenance = <T extends object>(result: T, raw?: object): T =>
  setStyleProvenance(result, origin(raw));

export const updateStyleProvenance = (previous: object, patch: object): readonly string[] => {
  if ((patch as Marked)[STYLE_PROVENANCE]) return origin(patch);
  const explicit = new Set(origin(previous));
  for (const path of TRACKED_PATHS) {
    const state = suppliedPath(patch, path);
    if (state === "clear") explicit.delete(path);
    if (state === "explicit") explicit.add(path);
  }
  return [...explicit];
};

/** Unknown-origin external/default-filled configs conservatively keep present values explicit. */
export const hasExplicitStylePath = (config: object | undefined, path: string): boolean => {
  const stored = (config as Marked | undefined)?.[STYLE_PROVENANCE];
  if (!stored || !Object.prototype.hasOwnProperty.call(stored.values, path) || valueAt(config, path) !== stored.values[path]) {
    return suppliedPath(config, path) === "explicit";
  }
  return stored.explicit.includes(path);
};

/** Renderers keep responsibility for historical normalization and mode restrictions. */
export const getExplicitLegacyStyle = (config: object | undefined, path: string): unknown =>
  hasExplicitStylePath(config, path) ? valueAt(config, path) : undefined;

type SchemeConfig = { colorScheme?: "light" | "dark" | "auto"; brand?: BrandConfig };
export const hasExplicitThemeStyle = (
  config: object | undefined, componentPath: string, scheme?: "light" | "dark"
): boolean => {
  const options = config as SchemeConfig | undefined;
  const selected = scheme ?? options?.colorScheme ?? inferBrandColorScheme(options?.brand) ?? "light";
  const dark = selected === "dark" || (selected === "auto" && (
    (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  ));
  return hasExplicitStylePath(config, `theme.components.${componentPath}`) ||
    (dark && hasExplicitStylePath(config, `darkTheme.components.${componentPath}`));
};
