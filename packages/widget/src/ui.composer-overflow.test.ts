// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { ComposerAction } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

let observedWidth = 800;
let resizeCallbacks: Array<(entries: unknown[]) => void> = [];

class MockResizeObserver {
  constructor(private readonly callback: (entries: unknown[]) => void) {
    resizeCallbacks.push(callback);
  }
  observe(): void {
    this.callback([{ contentRect: { width: observedWidth } }]);
  }
  disconnect(): void {
    resizeCallbacks = resizeCallbacks.filter((cb) => cb !== this.callback);
  }
  unobserve(): void {}
}

const setFooterWidth = (width: number) => {
  observedWidth = width;
  for (const callback of [...resizeCallbacks]) {
    callback([{ contentRect: { width } }]);
  }
};

const makeController = (
  config: Record<string, unknown> = {},
  options: { shadow?: boolean } = {}
) => {
  const mount = document.createElement("div");
  if (options.shadow) {
    // `createAgentExperience` renders into whatever element it is given;
    // shadow hosting is `initAgentWidget`'s job, so build the root here.
    const host = document.createElement("div");
    document.body.appendChild(host);
    mounts.push(host);
    host.attachShadow({ mode: "open" }).appendChild(mount);
  } else {
    document.body.appendChild(mount);
    mounts.push(mount);
  }
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    attachments: { enabled: true },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const triggerOf = (root: Element | ShadowRoot) =>
  root.querySelector<HTMLButtonElement>(
    "[data-persona-composer-overflow-trigger]"
  );

const openPanel = (root: Element | ShadowRoot) => {
  triggerOf(root)!.click();
  return (root.getRootNode?.() === root ? root : document).querySelector<HTMLElement>(
    "[data-persona-composer-overflow-menu]"
  );
};

const action = (id: string, patch: Partial<ComposerAction> = {}): ComposerAction =>
  ({
    id,
    placement: "start",
    label: id,
    onSelect: () => {},
    ...patch,
  }) as ComposerAction;

describe("composer overflow menu in the live widget", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    observedWidth = 800;
    resizeCallbacks = [];
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards the panel surface tokens onto the portaled menu on open", () => {
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    });
    // The panel is portaled to document.body, so it never inherits the mount's
    // theme vars. Stamped on the trigger here because jsdom's computed style
    // does not inherit custom properties.
    const trigger = triggerOf(mount)!;
    trigger.style.setProperty(
      "--persona-components-composer-overflowMenu-background",
      "#353535"
    );
    trigger.style.setProperty(
      "--persona-components-composer-overflowMenu-borderColor",
      "rgba(255, 255, 255, 0.08)"
    );

    const panel = openPanel(mount)!;

    expect(
      panel.style.getPropertyValue(
        "--persona-components-composer-overflowMenu-background"
      )
    ).toBe("#353535");
    expect(
      panel.style.getPropertyValue(
        "--persona-components-composer-overflowMenu-borderColor"
      )
    ).toBe("rgba(255, 255, 255, 0.08)");
    // Unset keys stamp nothing, so the stylesheet's fallback still stands.
    expect(
      panel.style.getPropertyValue(
        "--persona-components-composer-overflowMenu-shadow"
      )
    ).toBe("");
  });

  it("returns the panel to the stylesheet fallback when an update unsets the token", () => {
    const token = "--persona-components-composer-overflowMenu-background";
    const { mount, controller } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
      theme: {
        components: { composer: { overflowMenu: { background: "#353535" } } },
      },
    });
    expect(mount.style.getPropertyValue(token)).toBe("#353535");
    // Stamped on the trigger for the same reason as the test above: jsdom's
    // computed style does not inherit custom properties.
    const trigger = triggerOf(mount)!;
    trigger.style.setProperty(token, "#353535");

    const panel = openPanel(mount)!;
    expect(panel.style.getPropertyValue(token)).toBe("#353535");
    triggerOf(mount)!.click();

    // Explicit undefined is the documented reset, so the mount stops carrying
    // the var; the trigger's stand-in follows it.
    controller.update({
      theme: {
        components: { composer: { overflowMenu: { background: undefined } } },
      },
    });
    expect(mount.style.getPropertyValue(token)).toBe("");
    trigger.style.removeProperty(token);

    // The panel outlives the update, so the next open has to clear the value
    // the first one stamped; an empty inline value is the fallback state.
    const reopened = openPanel(mount)!;
    expect(reopened).toBe(panel);
    expect(reopened.style.getPropertyValue(token)).toBe("");
  });

  it("sorts the trigger at the 900 anchor by default", () => {
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    });
    const start = mount.querySelector<HTMLElement>(
      "[data-persona-composer-actions-start]"
    )!;
    const children = Array.from(start.children);
    const triggerIndex = children.findIndex((child) =>
      child.querySelector("[data-persona-composer-overflow-trigger]")
    );
    const attachmentIndex = children.findIndex((child) =>
      child.querySelector(".persona-attachment-button")
    );
    expect(attachmentIndex).toBe(0);
    expect(triggerIndex).toBe(1);
  });

  it("leads the bar when actionOverflow.order sorts ahead of the built-ins", () => {
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, order: 0 },
      },
    });
    const start = mount.querySelector<HTMLElement>(
      "[data-persona-composer-actions-start]"
    )!;
    expect(
      start.firstElementChild?.querySelector(
        "[data-persona-composer-overflow-trigger]"
      )
    ).not.toBeNull();
  });

  it("folds the attachment built-in only when includeBuiltIns names it", () => {
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const panel = openPanel(mount)!;
    expect(panel.querySelector(".persona-attachment-button")).toBeTruthy();
  });

  it("leaves the attachment built-in in the bar without includeBuiltIns", () => {
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    });
    const panel = openPanel(mount)!;
    expect(panel.querySelector(".persona-attachment-button")).toBeNull();
    expect(
      mount.querySelector(
        "[data-persona-composer-actions-start] .persona-attachment-button"
      )
    ).toBeTruthy();
  });

  it("labels the folded attachment row and leaves the bar icon-only", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Attach a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const panel = openPanel(mount)!;
    const slot = panel.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    expect(
      slot.querySelector(".persona-composer-overflow-menu__label")?.textContent
    ).toBe("Attach a file");
    // Nothing labeled leaked into the action row.
    expect(
      mount.querySelector(
        "[data-persona-composer-actions-start] .persona-composer-overflow-menu__label"
      )
    ).toBeNull();
  });

  it("labels the default tooltip-bearing attachment control and opens no tooltip in the menu", () => {
    const { mount } = makeController({
      // showTooltip is not opt-in for the attachment control: the bar always
      // attaches one, so this is the default shape of a folded built-in.
      attachments: { enabled: true, buttonTooltipText: "Add photos and files" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const slot = openPanel(mount)!.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    expect(
      slot.querySelector(".persona-composer-overflow-menu__label")?.textContent
    ).toBe("Add photos and files");

    // Hovering and focusing the row must not portal a tooltip anywhere.
    slot.dispatchEvent(new MouseEvent("mouseenter"));
    slot.querySelector("[data-persona-composer-attachment-button]")!
      .dispatchEvent(new FocusEvent("focus"));
    expect(document.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("closes a tooltip that was already open when the control folds", () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Add photos and files" },
      // Hover assertions are synchronous; drop the hover-intent delay.
      tooltip: { delayMs: 0, skipDelayMs: 0 },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    });
    const wrapper = mount
      .querySelector("[data-persona-composer-attachment-button]")!
      .parentElement!;
    wrapper.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.querySelector(".persona-control-tooltip")).not.toBeNull();

    controller.update({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    } as never);
    expect(document.querySelector(".persona-control-tooltip")).toBeNull();
  });

  it("restores bar tooltip behavior after the control unfolds", () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Add photos and files" },
      // Hover assertions are synchronous; drop the hover-intent delay.
      tooltip: { delayMs: 0, skipDelayMs: 0 },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    controller.update({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: [] },
      },
    } as never);
    const wrapper = mount
      .querySelector("[data-persona-composer-attachment-button]")!
      .parentElement!;
    expect(wrapper.closest("[data-persona-tooltip-suppressed]")).toBeNull();
    wrapper.dispatchEvent(new MouseEvent("mouseenter"));
    expect(
      document.querySelector(".persona-control-tooltip")?.textContent
    ).toContain("Add photos and files");
  });

  it("carries no bar chrome markers inside the folded row", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Add photos and files" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const slot = openPanel(mount)!.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    const control = slot.querySelector<HTMLElement>(
      "[data-persona-composer-attachment-button]"
    )!;
    // The CSS strips the box; nothing may re-assert it inline.
    for (const property of ["width", "height", "minWidth", "minHeight", "backgroundColor"] as const) {
      expect(control.style[property]).toBe("");
    }
    // The row, not the control, is the hover surface.
    expect(slot.classList.contains("persona-composer-overflow-menu__slot")).toBe(true);
    expect(control.classList.contains("persona-composer-control")).toBe(true);
  });

  it("closes the menu and opens the file input when a folded attachment row is clicked", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const input = mount.querySelector<HTMLInputElement>(
      "[data-persona-composer-attachment-input]"
    )!;
    const picker = vi.fn();
    input.addEventListener("click", picker);

    const trigger = triggerOf(mount)!;
    const panel = openPanel(mount)!;
    const control = panel.querySelector<HTMLButtonElement>(
      "[data-persona-composer-attachment-button]"
    )!;
    control.click();

    expect(picker).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // The menu restored focus to the trigger; the composer form then takes it
    // to the editor because `input.click()` bubbles inside the form. Either
    // way focus is never left on a row of a closed menu.
    expect(document.activeElement).not.toBe(control);
    expect(mount.contains(document.activeElement)).toBe(true);
  });

  it("closes the menu and opens the file input from the row label", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const picker = vi.fn();
    mount
      .querySelector("[data-persona-composer-attachment-input]")!
      .addEventListener("click", picker);

    const trigger = triggerOf(mount)!;
    const panel = openPanel(mount)!;
    const label = panel.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__label"
    )!;
    label.click();

    expect(picker).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(mount.contains(document.activeElement)).toBe(true);
  });

  it.each([["Enter"], [" "]])(
    "keyboard activation (%s) of a folded attachment behaves like a pointer click",
    (key) => {
      const { mount } = makeController({
        attachments: { enabled: true, buttonTooltipText: "Upload a file" },
        composer: {
          actions: [action("folded", { presentation: "overflow" })],
          actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
        },
      });
      const picker = vi.fn();
      mount
        .querySelector("[data-persona-composer-attachment-input]")!
        .addEventListener("click", picker);

      const trigger = triggerOf(mount)!;
      const panel = openPanel(mount)!;
      const control = panel.querySelector<HTMLButtonElement>(
        "[data-persona-composer-attachment-button]"
      )!;
      control.focus();
      // Enter and Space on a focused button dispatch a native click.
      control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      control.click();

      expect(picker).toHaveBeenCalledOnce();
      expect(
        document.querySelector("[data-persona-composer-overflow-menu]")
      ).toBeNull();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(control.isConnected).toBe(false);
    }
  );

  it("closes the menu when a folded mention affordance is activated", () => {
    const { mount } = makeController({
      contextMentions: {
        enabled: true,
        sources: [
          {
            id: "docs",
            label: "Docs",
            items: [{ id: "a", label: "A", body: "A" }],
          },
        ],
      },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["mentions"] },
      },
    });
    const trigger = triggerOf(mount)!;
    const panel = openPanel(mount)!;
    // The mention button stops propagation, so only a capture-phase listener
    // can see this activation.
    panel.querySelector<HTMLButtonElement>(".persona-mention-button")!.click();
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("a disabled folded control does not close the menu", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        // A composer lock disables the attachment control.
        inputDisabled: true,
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const panel = openPanel(mount)!;
    const control = panel.querySelector<HTMLButtonElement>(
      "[data-persona-composer-attachment-button]"
    )!;
    expect(control.disabled).toBe(true);
    panel
      .querySelector<HTMLElement>(".persona-composer-overflow-menu__label")!
      .click();
    expect(
      document.querySelector("[data-persona-composer-overflow-menu]")
    ).not.toBeNull();
  });

  it("leaves contributed row activation behavior unchanged", () => {
    const onSelect = vi.fn();
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow", onSelect })],
        actionOverflow: { enabled: true },
      },
    });
    const trigger = triggerOf(mount)!;
    const panel = openPanel(mount)!;
    panel.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("shades no row when the menu is opened with the mouse", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        // The folded attachment sorts first (order 200), which is the row the
        // programmatic open-focus lands on.
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const panel = openPanel(mount)!;
    const slot = panel.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    // Focus is on the row for keyboard continuity, but not visibly so.
    expect(
      slot.querySelector("[data-persona-composer-attachment-button]")
    ).toBe(document.activeElement);
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(false);
    expect(
      panel.querySelectorAll("[data-persona-menu-focus]")
    ).toHaveLength(0);
  });

  it("shades no row when a contributed row sorts first on a mouse open", () => {
    const { mount } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow", order: 100 })],
        actionOverflow: { enabled: true },
      },
    });
    const panel = openPanel(mount)!;
    expect(panel.querySelectorAll("[data-persona-menu-focus]")).toHaveLength(0);
  });

  it.each([["ArrowDown"], ["Enter"], [" "]])(
    "shades the first row when the menu is opened with %s",
    (key) => {
      const { mount } = makeController({
        attachments: { enabled: true, buttonTooltipText: "Upload a file" },
        composer: {
          actions: [action("folded", { presentation: "overflow" })],
          actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
        },
      });
      const trigger = triggerOf(mount)!;
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      const panel = document.querySelector<HTMLElement>(
        "[data-persona-composer-overflow-menu]"
      )!;
      const slot = panel.querySelector<HTMLElement>(
        ".persona-composer-overflow-menu__slot"
      )!;
      expect(slot.hasAttribute("data-persona-menu-focus")).toBe(true);
    }
  );

  it("moves the shading through slot and contributed rows alike on arrow keys", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [
          action("first", { presentation: "overflow", order: 300 }),
          action("second", { presentation: "overflow", order: 400 }),
        ],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    // Mouse open: nothing shaded yet.
    const panel = openPanel(mount)!;
    const slot = panel.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    expect(panel.querySelectorAll("[data-persona-menu-focus]")).toHaveLength(0);

    const arrow = (key: string) =>
      panel.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

    // First arrow moves off the slot onto the first contributed row.
    arrow("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    expect(items[0].hasAttribute("data-persona-menu-focus")).toBe(true);
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(false);

    arrow("ArrowDown");
    expect(items[1].hasAttribute("data-persona-menu-focus")).toBe(true);
    expect(items[0].hasAttribute("data-persona-menu-focus")).toBe(false);

    // Wrapping back onto the slot shades it, and only it.
    arrow("ArrowDown");
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(true);
    expect(panel.querySelectorAll("[data-persona-menu-focus]")).toHaveLength(1);

    arrow("End");
    expect(items[1].hasAttribute("data-persona-menu-focus")).toBe(true);
    arrow("Home");
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(true);
  });

  it("clears the shading when the menu closes and does not carry it to the next open", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const trigger = triggerOf(mount)!;
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    const slot = document
      .querySelector("[data-persona-composer-overflow-menu]")!
      .querySelector<HTMLElement>(".persona-composer-overflow-menu__slot")!;
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(true);

    document
      .querySelector("[data-persona-composer-overflow-menu]")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(false);

    // A following mouse open must start unshaded.
    trigger.click();
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(false);
  });

  it("drops the shading when a pointer press follows keyboard navigation", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow", order: 300 })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    const trigger = triggerOf(mount)!;
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    const panel = document.querySelector<HTMLElement>(
      "[data-persona-composer-overflow-menu]"
    )!;
    const slot = panel.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(true);

    // Pointer press inside the menu ends keyboard modality, as it would drop
    // :focus-visible on a contributed row.
    panel.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    panel.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(slot.hasAttribute("data-persona-menu-focus")).toBe(false);
  });

  it("leaves the unfolded control's own focus behavior untouched in the bar", () => {
    const { mount } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Upload a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    });
    const wrapper = mount
      .querySelector("[data-persona-composer-attachment-button]")!
      .parentElement!;
    // No menu bookkeeping leaks onto a control that never folded.
    expect(wrapper.hasAttribute("data-persona-menu-focus")).toBe(false);
    (wrapper.firstElementChild as HTMLButtonElement).focus();
    expect(wrapper.hasAttribute("data-persona-menu-focus")).toBe(false);
  });

  it("drops the label when the control unfolds back to the bar", () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Attach a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    controller.update({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: [] },
      },
    } as never);
    const attachmentWrapper = mount
      .querySelector("[data-persona-composer-attachment-button]")!
      .parentElement!;
    expect(attachmentWrapper.parentElement).toBe(
      mount.querySelector("[data-persona-composer-actions-start]")
    );
    expect(attachmentWrapper.textContent?.trim()).toBe("");
    expect(
      document.querySelector(".persona-composer-overflow-menu__label")
    ).toBeNull();
  });

  it("follows a live attachments.buttonTooltipText change", () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Attach a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    controller.update({
      attachments: { enabled: true, buttonTooltipText: "Upload a photo" },
    } as never);
    const slot = openPanel(mount)!.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    expect(
      slot.querySelector(".persona-composer-overflow-menu__label")?.textContent
    ).toBe("Upload a photo");
    expect(
      slot.querySelectorAll(".persona-composer-overflow-menu__label")
    ).toHaveLength(1);
  });

  it("keeps exactly one label across repeated updates and a composer rebuild", () => {
    const { mount, controller } = makeController({
      attachments: { enabled: true, buttonTooltipText: "Attach a file" },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["attachments"] },
      },
    });
    controller.update({ copy: { inputPlaceholder: "One" } } as never);
    controller.update({ copy: { inputPlaceholder: "Two" } } as never);
    // A live `contextMentions` edit rebuilds the composer surface end to end.
    controller.update({ contextMentions: { enabled: false } } as never);
    const slot = openPanel(mount)!.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    expect(
      slot.querySelectorAll(".persona-composer-overflow-menu__label")
    ).toHaveLength(1);
    expect(
      slot.querySelector(".persona-composer-overflow-menu__label")?.textContent
    ).toBe("Attach a file");
  });

  it("labels a folded mention affordance", () => {
    const { mount } = makeController({
      contextMentions: {
        enabled: true,
        sources: [
          {
            id: "docs",
            label: "Docs",
            items: [{ id: "a", label: "A", body: "A" }],
          },
        ],
      },
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true, includeBuiltIns: ["mentions"] },
      },
    });
    const panel = openPanel(mount)!;
    const mentionButton = panel.querySelector<HTMLElement>(
      ".persona-mention-button"
    )!;
    expect(mentionButton).toBeTruthy();
    const label = mentionButton
      .closest(".persona-composer-overflow-menu__slot")!
      .querySelector(".persona-composer-overflow-menu__label");
    expect(label?.textContent).toBe(mentionButton.getAttribute("aria-label"));
    expect(label?.textContent?.length).toBeGreaterThan(0);
  });

  it("collapses auto actions when the footer narrows and restores them", async () => {
    const { mount } = makeController({
      composer: {
        actions: [action("auto", { presentation: "auto" })],
        actionOverflow: { enabled: true, collapseAutoActionsBelow: "480px" },
      },
    });
    expect(triggerOf(mount)).toBeNull();

    setFooterWidth(320);
    const panel = openPanel(mount)!;
    expect(panel.querySelector('[role="menuitem"]')?.textContent).toContain("auto");

    triggerOf(mount)!.click();
    setFooterWidth(900);
    expect(triggerOf(mount)).toBeNull();
    expect(
      mount.querySelector('[data-persona-composer-action="auto"]')
    ).toBeTruthy();
  });

  it("re-resolves the menu when actionOverflow changes live", () => {
    const { mount, controller } = makeController({
      composer: { actions: [action("folded", { presentation: "overflow" })] },
    });
    expect(triggerOf(mount)).toBeNull();
    controller.update({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    } as never);
    expect(triggerOf(mount)).toBeTruthy();
  });

  it("keeps menu semantics inside a Shadow DOM widget", () => {
    const { mount } = makeController(
      {
        composer: {
          actions: [
            action("one", { presentation: "overflow" }),
            action("two", { presentation: "overflow" }),
          ],
          actionOverflow: { enabled: true },
        },
      },
      { shadow: true }
    );
    const root = mount.getRootNode() as ShadowRoot;
    const trigger = triggerOf(root)!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    trigger.click();
    const panel = root.querySelector<HTMLElement>(
      "[data-persona-composer-overflow-menu]"
    )!;
    // Mounted inside the shadow root, not leaked to the document body.
    expect(panel).toBeTruthy();
    expect(document.body.querySelector("[data-persona-composer-overflow-menu]"))
      .toBeNull();

    const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(root.activeElement).toBe(items[0]);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(root.activeElement).toBe(items[1]);
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.activeElement).toBe(trigger);
  });

  it("dismisses on an outside focus across the shadow boundary", () => {
    const { mount } = makeController(
      {
        composer: {
          actions: [action("one", { presentation: "overflow" })],
          actionOverflow: { enabled: true },
        },
      },
      { shadow: true }
    );
    const root = mount.getRootNode() as ShadowRoot;
    triggerOf(root)!.click();
    expect(root.querySelector("[data-persona-composer-overflow-menu]")).toBeTruthy();

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.dispatchEvent(
      new FocusEvent("focusin", { bubbles: true, composed: true })
    );
    expect(root.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
  });

  it("tears the menu down with the widget", () => {
    const { mount, controller } = makeController({
      composer: {
        actions: [action("folded", { presentation: "overflow" })],
        actionOverflow: { enabled: true },
      },
    });
    triggerOf(mount)!.click();
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeTruthy();
    controller.destroy();
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
  });
});
