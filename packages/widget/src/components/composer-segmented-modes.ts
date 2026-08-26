/**
 * Segmented presentation of a composer mode group.
 *
 * `ComposerModeGroup.presentation: "segmented"` collapses a group's modes into
 * ONE custom action: a rounded track whose segments are real buttons carrying
 * `aria-pressed`. The track is the state display, so the group's modes render
 * no header chips (see `chipVisibleComposerModes`).
 *
 * Composer DOM is not morphed, so the segment listeners are bound directly.
 */

import type { ComposerCustomAction, ComposerMode, ComposerModeGroup } from "../types";
import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { composerModeGroupActionId } from "../utils/composer-modes";

const SEGMENT_ICON_SIZE = 16;

export interface ComposerSegmentedModeOptions {
  groupId: string;
  getGroup: () => ComposerModeGroup | undefined;
  /** The group's modes, in `composer.modes` order. Re-read on every repaint. */
  getModes: () => readonly ComposerMode[];
  getActiveIds: () => readonly string[];
  /** Toggle request for one mode; the caller applies the group policy. */
  onSelect: (modeId: string) => void;
}

export interface ComposerSegmentedModeControl {
  action: ComposerCustomAction;
  /** Re-read the group's modes and the active ids after a live change. */
  repaint: () => void;
}

export function createComposerSegmentedModeAction(
  options: ComposerSegmentedModeOptions
): ComposerSegmentedModeControl {
  let repaintLive: (() => void) | null = null;

  const action: ComposerCustomAction = {
    id: composerModeGroupActionId(options.groupId),
    kind: "custom",
    placement: "start",
    // A track is not a menu row: it never folds into the overflow menu.
    presentation: "bar",
    label: options.getGroup()?.label ?? options.groupId,
    render: () => {
      const track = createNode("div", {
        className: "persona-composer-segmented",
        attrs: { "data-persona-composer-mode-group": options.groupId },
      });

      const segments = new Map<string, HTMLButtonElement>();
      let painted = "";

      const onClick = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget as HTMLButtonElement;
        const modeId = button.getAttribute("data-persona-composer-mode");
        if (!modeId) return;
        // A single-selection track always keeps one segment on: re-pressing the
        // active one would leave the group with nothing selected.
        const isActive = options.getActiveIds().includes(modeId);
        if (isActive && options.getGroup()?.selection === "single") return;
        options.onSelect(modeId);
      };

      const segment = (mode: ComposerMode): HTMLButtonElement => {
        const button = createNode("button", {
          className: "persona-composer-segmented-item",
          attrs: {
            type: "button",
            "data-persona-composer-mode": mode.id,
            "aria-label": mode.label,
          },
        }) as HTMLButtonElement;
        if (mode.iconName) {
          const icon = renderLucideIcon(
            mode.iconName,
            SEGMENT_ICON_SIZE,
            "currentColor",
            1.5
          );
          if (icon) button.appendChild(icon);
        }
        const label = createElement("span", "persona-composer-segmented-label");
        label.textContent = mode.shortLabel ?? mode.label;
        button.appendChild(label);
        button.addEventListener("click", onClick);
        return button;
      };

      const paint = (): void => {
        const group = options.getGroup();
        if (group?.label) {
          track.setAttribute("role", "group");
          track.setAttribute("aria-label", group.label);
        } else {
          track.removeAttribute("role");
          track.removeAttribute("aria-label");
        }

        const modes = options.getModes();
        const key = modes
          .map((mode) => `${mode.id}:${mode.shortLabel ?? mode.label}:${mode.iconName ?? ""}`)
          .join("|");
        if (key !== painted) {
          painted = key;
          for (const button of segments.values()) {
            button.removeEventListener("click", onClick);
          }
          segments.clear();
          const built = modes.map((mode) => {
            const button = segment(mode);
            segments.set(mode.id, button);
            return button;
          });
          track.replaceChildren(...built);
        }

        const active = options.getActiveIds();
        for (const [modeId, button] of segments) {
          button.setAttribute("aria-pressed", String(active.includes(modeId)));
        }
      };
      paint();
      repaintLive = paint;

      return {
        element: track,
        destroy: () => {
          if (repaintLive === paint) repaintLive = null;
          for (const button of segments.values()) {
            button.removeEventListener("click", onClick);
          }
          segments.clear();
        },
      };
    },
  };

  return { action, repaint: () => repaintLive?.() };
}
