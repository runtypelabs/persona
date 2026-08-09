// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMPOSER_OVERFLOW_ACTION_ID,
  createComposerActionRenderer,
  measureFooterContentWidth,
  resolveCollapseThreshold,
  type ComposerBuiltInDescriptor,
} from "./composer-actions";
import { bindComposerSurface } from "./composer-bindings";
import { buildComposer } from "./composer-builder";
import type {
  AgentWidgetConfig,
  ComposerAction,
  ComposerActionContext,
  ComposerActionOverflowConfig,
  ComposerState,
} from "../types";

const config: AgentWidgetConfig = {
  apiUrl: "/api",
  attachments: { enabled: true },
};

const idleState = (patch: Partial<ComposerState> = {}): Readonly<ComposerState> =>
  Object.freeze({
    text: "",
    attachments: [],
    mentionRefs: [],
    activeModeIds: [],
    phase: "idle",
    inputDisabled: false,
    sendDisabled: false,
    ...patch,
  }) as Readonly<ComposerState>;

const actionContext = {
  getState: () => idleState(),
  getValue: () => "",
  setValue: () => {},
  submit: () => {},
  openAttachmentPicker: () => {},
  toggleVoice: () => {},
  requestRender: () => {},
} as ComposerActionContext;

/** The observed footer width the mocked ResizeObserver reports. */
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

const setFooterWidth = (width: number): void => {
  observedWidth = width;
  for (const callback of [...resizeCallbacks]) {
    callback([{ contentRect: { width } }]);
  }
};

type Harness = ReturnType<typeof mount>;

const mount = (options: {
  actions?: ComposerAction[];
  overflow?: ComposerActionOverflowConfig;
  state?: () => Readonly<ComposerState>;
  builtIns?: ComposerBuiltInDescriptor[];
}) => {
  const elements = buildComposer({ config });
  document.body.appendChild(elements.footer);
  const bindings = bindComposerSurface(elements.footer)!;
  const builtIns: ComposerBuiltInDescriptor[] =
    options.builtIns ??
    (elements.attachmentButtonWrapper
      ? [
          {
            id: "core:attachment",
            placement: "start",
            order: 200,
            element: elements.attachmentButtonWrapper,
          },
        ]
      : []);
  const renderer = createComposerActionRenderer({
    getBindings: () => bindings,
    collect: () => ({
      builtIns,
      configActions: options.actions ?? [],
      plugins: [],
      contributionContext: {
        config,
        getState: () => idleState(),
        requestRender: () => {},
      },
    }),
    actionContext,
    getState: options.state ?? (() => idleState()),
    getOverflow: () => options.overflow,
    reportError: () => {},
  });
  renderer.resolve();
  return { elements, bindings, renderer };
};

const panelOf = (harness: Harness) => harness.renderer.getOverflowMenu()?.panel;
const triggerOf = (harness: Harness) =>
  harness.renderer.getOverflowMenu()?.triggerButton;
const menuItems = (harness: Harness) =>
  Array.from(panelOf(harness)?.querySelectorAll('[role="menuitem"]') ?? []);
const startCluster = (harness: Harness) => harness.bindings.actionsStart;

const button = (id: string, patch: Partial<ComposerAction> = {}): ComposerAction =>
  ({
    id,
    placement: "start",
    label: id,
    onSelect: () => {},
    ...patch,
  }) as ComposerAction;

describe("composer overflow menu", () => {
  beforeEach(() => {
    observedWidth = 800;
    resizeCallbacks = [];
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders no trigger while the menu would be empty", () => {
    const harness = mount({
      actions: [button("a")],
      overflow: { enabled: true },
    });
    expect(
      startCluster(harness).querySelector(
        "[data-persona-composer-overflow-trigger]"
      )
    ).toBeNull();
    expect(harness.renderer.getOverflowMenu()).toBeNull();
  });

  it("keeps overflow and auto actions in the bar while the menu is disabled", () => {
    const harness = mount({
      actions: [
        button("always", { presentation: "overflow" }),
        button("maybe", { presentation: "auto" }),
      ],
    });
    // Both contributed actions plus the attachment built-in (a positional
    // placeholder, so it carries no action attribute).
    expect(
      startCluster(harness).querySelectorAll("[data-persona-composer-action]")
    ).toHaveLength(2);
    expect(harness.bindings.attachmentButton?.parentElement?.parentElement).toBe(
      startCluster(harness)
    );
    expect(harness.renderer.getOverflowMenu()).toBeNull();
  });

  it("puts presentation:overflow actions in the menu and shows the trigger", () => {
    const harness = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    expect(menuItems(harness).map((el) => el.textContent)).toEqual(["folded"]);
    expect(triggerOf(harness)).toBeTruthy();
    expect(
      startCluster(harness).querySelector(
        "[data-persona-composer-overflow-trigger]"
      )
    ).toBeTruthy();
  });

  it("sizes the overflow trigger from the control-size token, not an inline box", () => {
    const harness = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    const trigger = triggerOf(harness)!;
    expect(trigger.classList.contains("persona-composer-control")).toBe(true);
    expect(trigger.classList.contains("persona-composer-control--glyph")).toBe(
      true,
    );
    expect(trigger.style.width).toBe("");
    expect(trigger.style.height).toBe("");
    expect(trigger.style.minWidth).toBe("");
    expect(trigger.style.minHeight).toBe("");
  });

  it("orders the trigger at 900 in the start cluster", () => {
    const harness = mount({
      actions: [
        button("early", { order: 50 }),
        button("late", { order: 950 }),
        button("folded", { presentation: "overflow" }),
      ],
      overflow: { enabled: true },
    });
    const ids = Array.from(startCluster(harness).children).map((child) =>
      child.getAttribute("data-persona-composer-action") ??
      (child.querySelector("[data-persona-composer-overflow-trigger]")
        ? COMPOSER_OVERFLOW_ACTION_ID
        : "?")
    );
    expect(ids.indexOf(COMPOSER_OVERFLOW_ACTION_ID)).toBeGreaterThan(
      ids.indexOf("early")
    );
    expect(ids.indexOf(COMPOSER_OVERFLOW_ACTION_ID)).toBeLessThan(
      ids.indexOf("late")
    );
  });

  it("collapses auto actions below the configured pixel threshold", () => {
    const harness = mount({
      actions: [button("auto", { presentation: "auto" })],
      overflow: { enabled: true, collapseAutoActionsBelow: 500 },
    });
    // 800px: still in the bar, and with nothing else folded there is no menu.
    expect(harness.renderer.getOverflowMenu()).toBeNull();

    setFooterWidth(400);
    expect(menuItems(harness).map((el) => el.textContent)).toEqual(["auto"]);

    setFooterWidth(900);
    expect(menuItems(harness)).toHaveLength(0);
    expect(
      startCluster(harness).querySelector('[data-persona-composer-action="auto"]')
    ).toBeTruthy();
  });

  it("never collapses auto actions without a threshold", () => {
    const harness = mount({
      actions: [button("auto", { presentation: "auto" })],
      overflow: { enabled: true },
    });
    setFooterWidth(120);
    expect(harness.renderer.getOverflowMenu()).toBeNull();
    expect(
      startCluster(harness).querySelector('[data-persona-composer-action="auto"]')
    ).toBeTruthy();
  });

  it("folds a built-in only when includeBuiltIns names it", () => {
    const withoutFold = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    expect(
      withoutFold.bindings.attachmentButton?.closest(
        "[data-persona-composer-overflow-menu]"
      )
    ).toBeNull();
    document.body.innerHTML = "";

    const withFold = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    expect(
      withFold.bindings.attachmentButton?.closest(
        "[data-persona-composer-overflow-menu]"
      )
    ).toBeTruthy();
  });

  it("returns a folded built-in to the bar when the policy drops it", () => {
    let overflow: ComposerActionOverflowConfig = {
      enabled: true,
      includeBuiltIns: ["attachments"],
    };
    const elements = buildComposer({ config });
    document.body.appendChild(elements.footer);
    const bindings = bindComposerSurface(elements.footer)!;
    const renderer = createComposerActionRenderer({
      getBindings: () => bindings,
      collect: () => ({
        builtIns: [
          {
            id: "core:attachment",
            placement: "start",
            order: 200,
            element: elements.attachmentButtonWrapper!,
          },
        ],
        configActions: [],
        plugins: [],
        contributionContext: {
          config,
          getState: () => idleState(),
          requestRender: () => {},
        },
      }),
      actionContext,
      getState: () => idleState(),
      getOverflow: () => overflow,
      reportError: () => {},
    });
    renderer.resolve();
    expect(
      elements.attachmentButtonWrapper!.closest(
        "[data-persona-composer-overflow-menu]"
      )
    ).toBeTruthy();

    overflow = { enabled: true };
    renderer.resolve();
    expect(elements.attachmentButtonWrapper!.parentElement).toBe(
      bindings.actionsStart
    );
    renderer.destroy();
  });

  it("labels an icon-only folded built-in with its accessible name", () => {
    const harness = mount({
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    const slot = panelOf(harness)!.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__slot"
    )!;
    const label = slot.querySelector(".persona-composer-overflow-menu__label");
    expect(label?.textContent).toBe(
      harness.bindings.attachmentButton!.getAttribute("aria-label")
    );
  });

  it("labels a folded mention affordance the same way", () => {
    const wrapper = document.createElement("div");
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Add context");
    wrapper.appendChild(button);
    const harness = mount({
      builtIns: [
        { id: "core:mention-0", placement: "start", order: 100, element: wrapper },
      ],
      overflow: { enabled: true, includeBuiltIns: ["mentions"] },
    });
    expect(
      panelOf(harness)!.querySelector(".persona-composer-overflow-menu__label")
        ?.textContent
    ).toBe("Add context");
  });

  it("falls back to the tooltip title when there is no aria-label", () => {
    const wrapper = document.createElement("div");
    const button = document.createElement("button");
    button.setAttribute("title", "Attach a file");
    wrapper.appendChild(button);
    const harness = mount({
      builtIns: [
        { id: "core:attachment", placement: "start", order: 200, element: wrapper },
      ],
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    expect(
      panelOf(harness)!.querySelector(".persona-composer-overflow-menu__label")
        ?.textContent
    ).toBe("Attach a file");
  });

  it("does not duplicate the label across repeated resolve and sync passes", () => {
    const harness = mount({
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    harness.renderer.resolve();
    harness.renderer.resolve();
    harness.renderer.sync();
    expect(
      panelOf(harness)!.querySelectorAll(".persona-composer-overflow-menu__label")
    ).toHaveLength(1);
  });

  it("re-reads the accessible name on the next pass", () => {
    const harness = mount({
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    harness.bindings.attachmentButton!.setAttribute("aria-label", "Upload a photo");
    harness.renderer.sync();
    expect(
      panelOf(harness)!.querySelector(".persona-composer-overflow-menu__label")
        ?.textContent
    ).toBe("Upload a photo");
  });

  it("leaves no label behind when the control returns to the bar", () => {
    let overflow: ComposerActionOverflowConfig = {
      enabled: true,
      includeBuiltIns: ["attachments"],
    };
    const elements = buildComposer({ config });
    document.body.appendChild(elements.footer);
    const bindings = bindComposerSurface(elements.footer)!;
    const renderer = createComposerActionRenderer({
      getBindings: () => bindings,
      collect: () => ({
        builtIns: [
          {
            id: "core:attachment",
            placement: "start",
            order: 200,
            element: elements.attachmentButtonWrapper!,
          },
        ],
        configActions: [],
        plugins: [],
        contributionContext: {
          config,
          getState: () => idleState(),
          requestRender: () => {},
        },
      }),
      actionContext,
      getState: () => idleState(),
      getOverflow: () => overflow,
      reportError: () => {},
    });
    renderer.resolve();
    expect(
      renderer
        .getOverflowMenu()!
        .panel.querySelector(".persona-composer-overflow-menu__label")
    ).toBeTruthy();

    overflow = { enabled: true, includeBuiltIns: [] };
    renderer.resolve();
    // Back in the bar: icon only, no stray text anywhere in the cluster.
    expect(elements.attachmentButtonWrapper!.parentElement).toBe(
      bindings.actionsStart
    );
    expect(
      bindings.actionsStart.querySelector(".persona-composer-overflow-menu__label")
    ).toBeNull();
    expect(elements.attachmentButtonWrapper!.textContent?.trim()).toBe("");
    renderer.destroy();
  });

  it("still labels a control whose only text is a portaled tooltip span", () => {
    // The tooltip mounts outside the control, but a naive textContent walk over
    // any tooltip-shaped span would read as "already labeled".
    const wrapper = document.createElement("div");
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Upload a file");
    const tooltip = document.createElement("span");
    tooltip.className = "persona-control-tooltip";
    tooltip.textContent = "Upload a file";
    button.appendChild(tooltip);
    wrapper.appendChild(button);
    const harness = mount({
      builtIns: [
        { id: "core:attachment", placement: "start", order: 200, element: wrapper },
      ],
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    expect(
      panelOf(harness)!.querySelector(".persona-composer-overflow-menu__label")
        ?.textContent
    ).toBe("Upload a file");
  });

  it.each([
    ['<span role="tooltip">Upload</span>', "role=tooltip"],
    ['<span class="persona-sr-only">Upload</span>', "sr-only"],
    ['<span aria-hidden="true">Upload</span>', "aria-hidden"],
    ["<span hidden>Upload</span>", "hidden"],
  ])("ignores %s text when deciding to label (%s)", (markup) => {
    const wrapper = document.createElement("div");
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Upload a file");
    button.innerHTML = markup;
    wrapper.appendChild(button);
    const harness = mount({
      builtIns: [
        { id: "core:attachment", placement: "start", order: 200, element: wrapper },
      ],
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    expect(
      panelOf(harness)!.querySelector(".persona-composer-overflow-menu__label")
        ?.textContent
    ).toBe("Upload a file");
  });

  it("marks the slot as tooltip-suppressing", () => {
    const harness = mount({
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    expect(
      panelOf(harness)!
        .querySelector(".persona-composer-overflow-menu__slot")!
        .hasAttribute("data-persona-tooltip-suppressed")
    ).toBe(true);
  });

  it("does not label a folded control that renders its own text", () => {
    const element = document.createElement("div");
    element.textContent = "Templates";
    const harness = mount({
      builtIns: [
        { id: "core:attachment", placement: "start", order: 200, element },
      ],
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    expect(
      panelOf(harness)!.querySelector(".persona-composer-overflow-menu__label")
    ).toBeNull();
  });

  it("clicking the label row activates the folded control", () => {
    const harness = mount({
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    const clicked = vi.fn();
    harness.bindings.attachmentButton!.addEventListener("click", clicked);
    const label = panelOf(harness)!.querySelector<HTMLElement>(
      ".persona-composer-overflow-menu__label"
    )!;
    label.click();
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("does not double-fire when the control itself is clicked", () => {
    const harness = mount({
      overflow: { enabled: true, includeBuiltIns: ["attachments"] },
    });
    const clicked = vi.fn();
    harness.bindings.attachmentButton!.addEventListener("click", clicked);
    harness.bindings.attachmentButton!.click();
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("renders a custom action's own element inside the menu panel", () => {
    const element = document.createElement("div");
    element.textContent = "custom";
    const harness = mount({
      actions: [
        {
          id: "custom",
          kind: "custom",
          placement: "start",
          presentation: "overflow",
          label: "Custom",
          render: () => ({ element }),
        } as ComposerAction,
      ],
      overflow: { enabled: true },
    });
    expect(element.closest("[data-persona-composer-overflow-menu]")).toBe(
      panelOf(harness)
    );
    expect(element.parentElement?.getAttribute("role")).toBe("none");
  });

  it("carries pressed, disabled, and busy state into menu items", async () => {
    let resolveSelect: (() => void) | undefined;
    const harness = mount({
      actions: [
        button("pressed", { presentation: "overflow", pressed: true }),
        button("off", { presentation: "overflow", disabled: true }),
        button("async", {
          presentation: "overflow",
          onSelect: () =>
            new Promise<void>((resolve) => {
              resolveSelect = resolve;
            }),
        }),
      ],
      overflow: { enabled: true },
    });
    const items = menuItems(harness) as HTMLButtonElement[];
    expect(items[0].getAttribute("aria-pressed")).toBe("true");
    expect(items[1].disabled).toBe(true);

    items[2].click();
    expect(items[2].getAttribute("aria-busy")).toBe("true");
    resolveSelect?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(items[2].hasAttribute("aria-busy")).toBe(false);
  });

  it("exposes menu semantics on the trigger and panel", () => {
    const harness = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    const trigger = triggerOf(harness)!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(panelOf(harness)!.getAttribute("role")).toBe("menu");
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("navigates with Arrow, Home, and End keys", () => {
    const harness = mount({
      actions: [
        button("one", { presentation: "overflow" }),
        button("two", { presentation: "overflow" }),
        button("three", { presentation: "overflow" }),
      ],
      overflow: { enabled: true },
    });
    const trigger = triggerOf(harness)!;
    const panel = panelOf(harness)!;
    const items = menuItems(harness) as HTMLButtonElement[];

    trigger.click();
    expect(document.activeElement).toBe(items[0]);

    const key = (k: string) =>
      panel.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, bubbles: true })
      );

    key("ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    key("End");
    expect(document.activeElement).toBe(items[2]);
    key("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    key("ArrowUp");
    expect(document.activeElement).toBe(items[2]);
    key("Home");
    expect(document.activeElement).toBe(items[0]);
    expect(items[0].getAttribute("tabindex")).toBe("0");
    expect(items[1].getAttribute("tabindex")).toBe("-1");
  });

  it("skips disabled rows during navigation", () => {
    const harness = mount({
      actions: [
        button("one", { presentation: "overflow" }),
        button("off", { presentation: "overflow", disabled: true }),
        button("three", { presentation: "overflow" }),
      ],
      overflow: { enabled: true },
    });
    triggerOf(harness)!.click();
    panelOf(harness)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect((document.activeElement as HTMLElement).textContent).toBe("three");
  });

  it("Escape closes and returns focus to the trigger", () => {
    const harness = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    const trigger = triggerOf(harness)!;
    trigger.click();
    panelOf(harness)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(harness.renderer.getOverflowMenu()!.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("Tab closes without trapping focus", () => {
    const harness = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    triggerOf(harness)!.click();
    panelOf(harness)!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    );
    expect(harness.renderer.getOverflowMenu()!.isOpen()).toBe(false);
  });

  it("activating a menu item runs onSelect, closes, and restores focus", () => {
    const onSelect = vi.fn();
    const harness = mount({
      actions: [button("folded", { presentation: "overflow", onSelect })],
      overflow: { enabled: true },
    });
    const trigger = triggerOf(harness)!;
    trigger.click();
    (menuItems(harness)[0] as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(harness.renderer.getOverflowMenu()!.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses on an outside pointerdown", async () => {
    const harness = mount({
      actions: [button("folded", { presentation: "overflow" })],
      overflow: { enabled: true },
    });
    triggerOf(harness)!.click();
    // createPopover defers arming the outside listener by one timer tick.
    await new Promise((resolve) => setTimeout(resolve, 1));
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(harness.renderer.getOverflowMenu()!.isOpen()).toBe(false);
  });

  it("dismisses when focus moves outside, across a shadow boundary", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const elements = buildComposer({ config });
    root.appendChild(elements.footer);
    const bindings = bindComposerSurface(elements.footer)!;
    const renderer = createComposerActionRenderer({
      getBindings: () => bindings,
      collect: () => ({
        builtIns: [],
        configActions: [button("folded", { presentation: "overflow" })],
        plugins: [],
        contributionContext: {
          config,
          getState: () => idleState(),
          requestRender: () => {},
        },
      }),
      actionContext,
      getState: () => idleState(),
      getOverflow: () => ({ enabled: true }),
      reportError: () => {},
    });
    renderer.resolve();
    const menu = renderer.getOverflowMenu()!;
    menu.triggerButton.click();
    expect(menu.isOpen()).toBe(true);
    // The panel mounts into the shadow root, not the document body.
    expect(menu.panel.getRootNode()).toBe(root);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
    expect(menu.isOpen()).toBe(false);
    renderer.destroy();
    host.remove();
  });

  it("hides the trigger again once nothing is left to fold", () => {
    let overflow: ComposerActionOverflowConfig = { enabled: true };
    let actions: ComposerAction[] = [button("folded", { presentation: "overflow" })];
    const elements = buildComposer({ config });
    document.body.appendChild(elements.footer);
    const bindings = bindComposerSurface(elements.footer)!;
    const renderer = createComposerActionRenderer({
      getBindings: () => bindings,
      collect: () => ({
        builtIns: [],
        configActions: actions,
        plugins: [],
        contributionContext: {
          config,
          getState: () => idleState(),
          requestRender: () => {},
        },
      }),
      actionContext,
      getState: () => idleState(),
      getOverflow: () => overflow,
      reportError: () => {},
    });
    renderer.resolve();
    expect(
      bindings.actionsStart.querySelector(
        "[data-persona-composer-overflow-trigger]"
      )
    ).toBeTruthy();

    actions = [];
    renderer.resolve();
    expect(
      bindings.actionsStart.querySelector(
        "[data-persona-composer-overflow-trigger]"
      )
    ).toBeNull();
    overflow = { enabled: true };
    renderer.destroy();
  });

  it("hides a menu row whose action becomes invisible", () => {
    let visible = true;
    const harness = mount({
      actions: [
        button("folded", { presentation: "overflow", visible: () => visible }),
        button("stays", { presentation: "overflow" }),
      ],
      overflow: { enabled: true },
    });
    expect(menuItems(harness)).toHaveLength(2);
    visible = false;
    harness.renderer.sync();
    expect(menuItems(harness).map((el) => el.textContent)).toEqual(["stays"]);
  });
});

describe("collapse threshold resolution", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("passes a number through as pixels", () => {
    const footer = document.createElement("div");
    expect(resolveCollapseThreshold(480, footer)).toBe(480);
  });

  it("parses a px string without touching the DOM", () => {
    const footer = document.createElement("div");
    expect(resolveCollapseThreshold("480px", footer)).toBe(480);
    expect(footer.children).toHaveLength(0);
  });

  it("returns null when unset", () => {
    expect(resolveCollapseThreshold(undefined, document.createElement("div"))).toBeNull();
  });

  it("measures a relative length against the footer and cleans up the probe", () => {
    const footer = document.createElement("div");
    document.body.appendChild(footer);
    resolveCollapseThreshold("30rem", footer);
    expect(footer.children).toHaveLength(0);
  });
});

describe("measureFooterContentWidth", () => {
  it("reports 0 for a footer that is not laid out", () => {
    expect(measureFooterContentWidth(document.createElement("div"))).toBe(0);
  });
});
