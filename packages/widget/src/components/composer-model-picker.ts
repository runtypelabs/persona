/**
 * Built-in model picker.
 *
 * A custom action, not a special case: `composer.models` contributes one
 * `ComposerCustomAction` at order 700 in the end cluster, so it orders, hides,
 * disables, and folds into the overflow menu like anything else.
 *
 * Two presentations share one selection path. `"native"` (the default) is a
 * plain `<select>`; `"popover"` is a button plus a `role="listbox"` panel with
 * icon, label, and description rows.
 *
 * The selection is UI state, never authority. It writes to the composer store
 * and rides each send as `ComposerSubmissionOptions.selectedModelId`; it never
 * writes back to config and never mutates `config.agent`.
 */

import { createPopover, type PopoverHandle } from "../plugin-kit";
import type { ComposerCustomAction, ComposerModel } from "../types";
import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { forwardMenuTokens } from "./composer-parts";

export const COMPOSER_MODEL_PICKER_ACTION_ID = "core:model";
export const COMPOSER_MODEL_PICKER_ORDER = 700;

const ROW_ICON_SIZE = 16;

/**
 * Tokens the popover panel reads, forwarded onto the portaled panel on every
 * open; unset ones clear so the stylesheet's fallbacks stand.
 */
const MENU_TOKEN_VARS = [
  "--persona-components-composer-modelPicker-menuBackground",
  "--persona-components-composer-modelPicker-menuBorderRadius",
  "--persona-components-composer-modelPicker-rowHoverBackground",
  "--persona-components-composer-modelPicker-labelColor",
  "--persona-components-composer-modelPicker-descriptionColor",
] as const;

export interface ComposerModelPickerOptions {
  getModels: () => ReadonlyArray<ComposerModel>;
  getSelectedModelId: () => string | undefined;
  onSelect: (modelId: string) => void;
  label?: string;
  /**
   * Fixed for the life of the control: a live change rebuilds the action, which
   * swaps the rendered element wholesale.
   * @default "native"
   */
  presentation?: "native" | "popover";
  /** Muted text after the selected label on the closed control. Popover only. */
  getSuffix?: () => string | undefined;
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

/** The wrapper both presentations share: one grid cell, control plus chevron. */
const createWrapper = (): { wrapper: HTMLElement; chevron: HTMLElement } => {
  // `appearance: none` drops the platform chevron, which Chrome draws
  // flush against the trailing edge and which ignores padding. `select`
  // takes no generated content, so the replacement chevron is a sibling
  // stacked in the same single-cell grid. The control stays focusable and
  // still paints the pill, so hover and the focus ring are unchanged.
  const wrapper = createNode("span", {
    className: "persona-composer-model-picker-wrapper",
    attrs: { "data-persona-composer-model-picker-wrapper": "" },
  });
  const chevron = createNode("span", {
    className: "persona-composer-model-picker-chevron",
    attrs: { "aria-hidden": "true" },
  });
  return { wrapper, chevron };
};

export function createComposerModelPickerAction(
  options: ComposerModelPickerOptions
): ComposerModelPicker {
  const label = options.label ?? "Model";
  const presentation = options.presentation ?? "native";
  let repaintLive: (() => void) | null = null;

  /** The model the control reads as selected; never blank while models exist. */
  const resolveSelected = (
    models: ReadonlyArray<ComposerModel>
  ): ComposerModel | undefined => {
    const selected = options.getSelectedModelId();
    return models.find((model) => model.id === selected) ?? models[0];
  };

  const renderNative = (): { element: HTMLElement; destroy: () => void } => {
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
      select.value = resolveSelected(models)?.id ?? "";
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

    const { wrapper, chevron } = createWrapper();
    wrapper.append(select, chevron);

    return {
      element: wrapper,
      destroy: () => {
        if (repaintLive === paint) repaintLive = null;
        select.removeEventListener("change", onChange);
        select.removeEventListener("click", onClick);
      },
    };
  };

  const renderPopover = (): { element: HTMLElement; destroy: () => void } => {
    const trigger = createNode("button", {
      className:
        "persona-composer-model-picker persona-composer-model-picker-trigger",
      attrs: {
        type: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        "data-persona-composer-model-picker": "popover",
      },
    }) as HTMLButtonElement;
    const triggerLabel = createElement(
      "span",
      "persona-composer-model-picker-label"
    );
    const triggerSuffix = createElement(
      "span",
      "persona-composer-model-picker-suffix"
    );
    trigger.append(triggerLabel, triggerSuffix);

    const menu = createNode("div", {
      className: "persona-composer-model-menu",
      attrs: {
        role: "listbox",
        tabindex: "-1",
        "aria-label": label,
        "data-persona-composer-model-menu": "",
      },
    });

    const rows = new Map<string, HTMLButtonElement>();
    let painted = "";

    // Built on first open: createPopover resolves its mount from the anchor's
    // root node, and the trigger is only parented after the renderer places it.
    let popover: PopoverHandle | null = null;
    const isOpen = (): boolean => popover?.isOpen === true;

    const close = (restoreFocus = false): void => {
      if (!isOpen()) return;
      popover?.close();
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus();
    };

    const focusRow = (index: number): void => {
      const targets = [...rows.values()];
      if (targets.length === 0) return;
      const clamped =
        ((index % targets.length) + targets.length) % targets.length;
      targets[clamped].focus();
    };

    const open = (focusIndex?: number): void => {
      if (isOpen()) return;
      if (!popover) {
        popover = createPopover({
          anchor: trigger,
          content: menu,
          placement: "top-start",
          offset: 6,
          onDismiss: () => trigger.setAttribute("aria-expanded", "false"),
        });
      }
      forwardMenuTokens(trigger, menu, MENU_TOKEN_VARS);
      popover.open();
      trigger.setAttribute("aria-expanded", "true");
      const ids = [...rows.keys()];
      const selectedIndex = ids.indexOf(resolveSelected(options.getModels())?.id ?? "");
      focusRow(focusIndex ?? (selectedIndex >= 0 ? selectedIndex : 0));
    };

    const choose = (modelId: string): void => {
      close(true);
      options.onSelect(modelId);
    };

    const onRowClick = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      const modelId = (event.currentTarget as HTMLElement).getAttribute(
        "data-persona-model-option"
      );
      if (modelId) choose(modelId);
    };

    const row = (model: ComposerModel): HTMLButtonElement => {
      const button = createNode("button", {
        className: "persona-composer-model-option",
        attrs: {
          type: "button",
          role: "option",
          tabindex: "-1",
          "aria-selected": "false",
          "data-persona-model-option": model.id,
        },
      }) as HTMLButtonElement;
      if (model.icon) {
        const glyph = renderLucideIcon(
          model.icon,
          ROW_ICON_SIZE,
          "currentColor",
          1.5
        );
        if (glyph) {
          const slot = createElement(
            "span",
            "persona-composer-model-option-icon"
          );
          slot.appendChild(glyph);
          button.appendChild(slot);
        }
      }
      const body = createElement("span", "persona-composer-model-option-body");
      const name = createElement("span", "persona-composer-model-option-label");
      name.textContent = model.label;
      body.appendChild(name);
      if (model.description) {
        const description = createElement(
          "span",
          "persona-composer-model-option-description"
        );
        description.textContent = model.description;
        body.appendChild(description);
      }
      button.appendChild(body);
      // Always drawn, revealed by `aria-selected`: the check is CSS state, so a
      // selection change never rebuilds a row.
      const check = createElement("span", "persona-composer-model-option-check");
      check.setAttribute("aria-hidden", "true");
      const tick = renderLucideIcon("check", ROW_ICON_SIZE, "currentColor", 2);
      if (tick) check.appendChild(tick);
      button.appendChild(check);
      button.addEventListener("click", onRowClick);
      return button;
    };

    const paint = (): void => {
      const models = options.getModels();
      const key = models
        .map(
          (model) =>
            `${model.id}:${model.label}:${model.icon ?? ""}:${model.description ?? ""}`
        )
        .join("|");
      if (key !== painted) {
        painted = key;
        for (const button of rows.values()) {
          button.removeEventListener("click", onRowClick);
        }
        rows.clear();
        menu.replaceChildren(
          ...models.map((model) => {
            const button = row(model);
            rows.set(model.id, button);
            return button;
          })
        );
      }

      const selected = resolveSelected(models);
      for (const [modelId, button] of rows) {
        button.setAttribute("aria-selected", String(modelId === selected?.id));
      }
      triggerLabel.textContent = selected?.label ?? "";
      const suffix = options.getSuffix?.() ?? "";
      triggerSuffix.textContent = suffix;
      trigger.setAttribute(
        "aria-label",
        [label, [selected?.label, suffix].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(": ")
      );
    };
    paint();
    repaintLive = paint;

    const onTriggerClick = (event: Event): void => {
      event.preventDefault();
      // The composer form focuses the input on stray clicks; this is a control.
      event.stopPropagation();
      if (isOpen()) close(true);
      else open();
    };

    const onTriggerKeydown = (event: KeyboardEvent): void => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (isOpen()) focusRow(0);
        else open(0);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (isOpen()) focusRow(-1);
        else open(-1);
      }
    };

    const onMenuKeydown = (event: KeyboardEvent): void => {
      const targets = [...rows.values()];
      const index = targets.indexOf(
        (event.target as HTMLElement)?.closest?.(
          ".persona-composer-model-option"
        ) as HTMLButtonElement
      );
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusRow(index + 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          focusRow(index - 1);
          return;
        case "Home":
          event.preventDefault();
          focusRow(0);
          return;
        case "End":
          event.preventDefault();
          focusRow(targets.length - 1);
          return;
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          close(true);
          return;
        case "Tab":
          // Never trap: close and hand the sequence back to the trigger.
          close(true);
          return;
        default:
      }
    };

    trigger.addEventListener("click", onTriggerClick);
    trigger.addEventListener("keydown", onTriggerKeydown);
    menu.addEventListener("keydown", onMenuKeydown);

    const { wrapper, chevron } = createWrapper();
    wrapper.append(trigger, chevron);

    return {
      element: wrapper,
      destroy: () => {
        if (repaintLive === paint) repaintLive = null;
        trigger.removeEventListener("click", onTriggerClick);
        trigger.removeEventListener("keydown", onTriggerKeydown);
        menu.removeEventListener("keydown", onMenuKeydown);
        for (const button of rows.values()) {
          button.removeEventListener("click", onRowClick);
        }
        rows.clear();
        popover?.destroy();
        popover = null;
        menu.remove();
      },
    };
  };

  const action: ComposerCustomAction = {
    id: COMPOSER_MODEL_PICKER_ACTION_ID,
    kind: "custom",
    placement: "end",
    order: COMPOSER_MODEL_PICKER_ORDER,
    // A popover trigger never folds into the overflow menu: a menu row that
    // opens a second panel fights the menu's own focus-out dismissal. The
    // native select keeps `"auto"`, so its behaviour is unchanged.
    presentation: presentation === "popover" ? "bar" : "auto",
    label,
    render: () => (presentation === "popover" ? renderPopover() : renderNative()),
  };

  return { action, repaint: () => repaintLive?.() };
}
