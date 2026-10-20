import type { AgentWidgetConfig, ComposerAction, ComposerMode } from "./types";
import type { createComposerStore } from "./utils/composer-store";
import type { renderLucideIcon } from "./utils/icons";
import { isSegmentedModeGroup, composerModeActionId, composerModeOrder } from "./utils/composer-modes";
import { createComposerModelPickerAction, type ComposerModelPicker } from "./components/composer-model-picker";
import { createComposerSegmentedModeAction, type ComposerSegmentedModeControl } from "./components/composer-segmented-modes";

/** Model/mode controls share the action renderer's lifetime and loading boundary. */
export function createComposerCoreControls(options: {
  getConfig: () => AgentWidgetConfig;
  getState: ReturnType<typeof createComposerStore>["getState"];
  getModes: () => readonly ComposerMode[];
  getChipModes: () => readonly ComposerMode[];
  hasComposerPlugin: () => boolean;
  renderIcon: typeof renderLucideIcon;
  onModelChange: (id: string) => void;
  onModeChange: (id: string) => void;
}) {
  let composerModelPicker: ComposerModelPicker | null = null;
  let composerModelPickerMode: "native" | "popover" | null = null;
  const composerSegmentedGroups = new Map<string, ComposerSegmentedModeControl>();
  /** Cached so the track keeps its element identity across re-resolves. */
  const ensureSegmentedModeGroup = (
    groupId: string
  ): ComposerSegmentedModeControl => {
    const existing = composerSegmentedGroups.get(groupId);
    if (existing) return existing;
    const control = createComposerSegmentedModeAction({
      renderIcon: options.renderIcon,
      groupId,
      getGroup: () =>
        options.getConfig().composer?.modeGroups?.find((group) => group.id === groupId),
      getModes: () =>
        options.getModes().filter((mode) => mode.groupId === groupId),
      getActiveIds: () => options.getState().activeModeIds,
      onSelect: (modeId) => options.onModeChange(modeId),
    });
    composerSegmentedGroups.set(groupId, control);
    return control;
  };

  const collectComposerCoreActions = (): ComposerAction[] => {
    const actions: ComposerAction[] = [];
    const active = options.getState().activeModeIds;
    const chipModeIds = new Set(options.getChipModes().map((mode) => mode.id));
    const seenSegmentedGroups = new Set<string>();
    options.getModes().forEach((mode, index) => {
      // A segmented group contributes one track at its first member's slot; the
      // members themselves contribute no loose buttons.
      if (isSegmentedModeGroup(mode.groupId, options.getConfig().composer?.modeGroups)) {
        const groupId = mode.groupId as string;
        if (seenSegmentedGroups.has(groupId)) return;
        seenSegmentedGroups.add(groupId);
        const control = ensureSegmentedModeGroup(groupId);
        control.action.order = composerModeOrder(index);
        control.action.label =
          options.getConfig().composer?.modeGroups?.find((group) => group.id === groupId)
            ?.label ?? groupId;
        actions.push(control.action);
        return;
      }
      const selectedLabel = active.includes(mode.id) && !chipModeIds.has(mode.id);
      actions.push({
        id: composerModeActionId(mode.id),
        kind: "button",
        placement: "start",
        order: composerModeOrder(index),
        presentation: selectedLabel ? "bar" : (mode.presentation ?? "auto"),
        label: mode.label,
        shortLabel: selectedLabel ? (mode.shortLabel ?? mode.label) : mode.shortLabel,
        iconName: mode.iconName,
        trailingIconName: mode.trailingIconName,
        pressed: active.includes(mode.id),
        onSelect: () => options.onModeChange(mode.id),
      });
    });
    // Exactly symmetric with the plugin handoff: a `renderComposer` plugin
    // already receives `models`/`selectedModelId`/`onModelChange` and owns the
    // control, so the built-in picker would be a second affordance.
    if (
      options.getConfig().composer?.models?.length &&
      !options.hasComposerPlugin()
    ) {
      // A presentation flip is a different control, so it rebuilds: the fresh
      // `render` identity is what makes the action registry swap the element.
      const presentation =
        options.getConfig().composer?.modelPicker?.presentation ?? "native";
      if (!composerModelPicker || composerModelPickerMode !== presentation) {
        composerModelPickerMode = presentation;
        composerModelPicker = createComposerModelPickerAction({
      renderIcon: options.renderIcon,
          getModels: () => options.getConfig().composer?.models ?? [],
          getSelectedModelId: () => options.getState().selectedModelId,
          onSelect: (modelId) => options.onModelChange(modelId),
          presentation,
          getSuffix: () => options.getConfig().composer?.modelPicker?.suffix,
        });
      }
      actions.push(composerModelPicker.action);
    }
    return actions;
  };

  return {
    collect: collectComposerCoreActions,
    repaint: () => {
      for (const [id, group] of composerSegmentedGroups) {
        if (!isSegmentedModeGroup(id, options.getConfig().composer?.modeGroups)) composerSegmentedGroups.delete(id);
        else group.repaint();
      }
      composerModelPicker?.repaint();
    },
  };
}
