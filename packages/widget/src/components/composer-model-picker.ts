/**
 * Built-in model picker.
 *
 * A custom action, not a special case: `composer.models` contributes one
 * `ComposerCustomAction` at order 700 in the end cluster, so it orders, hides,
 * disables, and folds into the overflow menu like anything else.
 *
 * The selection is UI state, never authority. It writes to the composer store
 * and rides each send as `ComposerSubmissionOptions.selectedModelId`; it never
 * writes back to config and never mutates `config.agent`.
 */

import type { ComposerCustomAction } from "../types";
import { createNode } from "../utils/dom";

export const COMPOSER_MODEL_PICKER_ACTION_ID = "core:model";
export const COMPOSER_MODEL_PICKER_ORDER = 700;

export interface ComposerModelPickerOptions {
  getModels: () => ReadonlyArray<{ id: string; label: string }>;
  getSelectedModelId: () => string | undefined;
  onSelect: (modelId: string) => void;
  label?: string;
}

export interface ComposerModelPicker {
  action: ComposerCustomAction;
  /**
   * Re-read the model list and the current selection. Config-derived DOM built
   * once at render would otherwise ignore live `update()` calls and programmatic
   * selection changes.
   */
  repaint: () => void;
}

export function createComposerModelPickerAction(
  options: ComposerModelPickerOptions
): ComposerModelPicker {
  const label = options.label ?? "Model";
  let repaintLive: (() => void) | null = null;
  const action: ComposerCustomAction = {
    id: COMPOSER_MODEL_PICKER_ACTION_ID,
    kind: "custom",
    placement: "end",
    order: COMPOSER_MODEL_PICKER_ORDER,
    presentation: "auto",
    label,
    render: () => {
      const select = createNode("select", {
        className: "persona-composer-model-picker",
        attrs: {
          "aria-label": label,
          "data-persona-composer-model-picker": "",
        },
      }) as HTMLSelectElement;

      let painted = "";
      const paint = (): void => {
        const models = options.getModels();
        const key = models.map((model) => `${model.id}:${model.label}`).join("|");
        if (key !== painted) {
          painted = key;
          select.replaceChildren(
            ...models.map((model) => {
              const option = createNode("option", {
                attrs: { value: model.id },
              }) as HTMLOptionElement;
              option.textContent = model.label;
              return option;
            })
          );
        }
        const selected = options.getSelectedModelId();
        // Falls back to the first model so the control never reads as blank.
        select.value =
          selected && models.some((model) => model.id === selected)
            ? selected
            : (models[0]?.id ?? "");
      };
      paint();
      repaintLive = paint;

      const onChange = (): void => {
        if (select.value) options.onSelect(select.value);
      };
      select.addEventListener("change", onChange);
      // The composer form focuses the input on stray clicks; this is a control.
      const onClick = (event: Event): void => event.stopPropagation();
      select.addEventListener("click", onClick);

      // `appearance: none` drops the platform chevron, which Chrome draws
      // flush against the trailing edge and which ignores padding. `select`
      // takes no generated content, so the replacement chevron is a sibling
      // stacked in the same single-cell grid. The select stays the focusable
      // control and still paints the pill, so hover and the focus ring are
      // unchanged.
      const wrapper = createNode("span", {
        className: "persona-composer-model-picker-wrapper",
        attrs: { "data-persona-composer-model-picker-wrapper": "" },
      });
      const chevron = createNode("span", {
        className: "persona-composer-model-picker-chevron",
        attrs: { "aria-hidden": "true" },
      });
      wrapper.append(select, chevron);

      return {
        element: wrapper,
        destroy: () => {
          if (repaintLive === paint) repaintLive = null;
          select.removeEventListener("change", onChange);
          select.removeEventListener("click", onClick);
        },
      };
    },
  };

  return { action, repaint: () => repaintLive?.() };
}
