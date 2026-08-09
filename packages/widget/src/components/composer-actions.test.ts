// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  COMPOSER_ACTION_ORDER,
  createComposerActionRenderer,
  resolveComposerActions,
  type ComposerBuiltInDescriptor,
} from "./composer-actions";
import { bindComposerSurface } from "./composer-bindings";
import { buildComposer } from "./composer-builder";
import { buildPillComposer } from "./pill-composer-builder";
import type { AgentWidgetPlugin } from "../plugins/types";
import type {
  AgentWidgetConfig,
  ComposerAction,
  ComposerActionContext,
  ComposerState,
} from "../types";

const config: AgentWidgetConfig = {
  apiUrl: "/api",
  attachments: { enabled: true },
  voiceRecognition: { enabled: true, provider: { type: "runtype" } },
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

const builtIn = (
  id: string,
  placement: "start" | "end",
  order: number,
  managed = false
): ComposerBuiltInDescriptor => ({
  id,
  placement,
  order,
  element: document.createElement("div"),
  managed,
});

const CORE_BUILT_INS = (): ComposerBuiltInDescriptor[] => [
  builtIn("core:mention-0", "start", COMPOSER_ACTION_ORDER.mention, true),
  builtIn("core:attachment", "start", COMPOSER_ACTION_ORDER.attachment),
  builtIn("core:mic", "end", COMPOSER_ACTION_ORDER.mic),
  builtIn("core:send", "end", COMPOSER_ACTION_ORDER.send),
];

const contributionContext = {
  config,
  getState: () => idleState(),
  requestRender: () => {},
};

const resolveWith = (input: {
  builtIns?: ComposerBuiltInDescriptor[];
  configActions?: ComposerAction[];
  plugins?: AgentWidgetPlugin[];
  debug?: boolean;
}) =>
  resolveComposerActions({
    builtIns: input.builtIns ?? [],
    configActions: input.configActions,
    plugins: input.plugins ?? [],
    contributionContext,
    debug: input.debug,
  });

const button = (patch: Partial<ComposerAction> = {}): ComposerAction =>
  ({
    id: "a",
    placement: "start",
    label: "Action A",
    onSelect: () => {},
    ...patch,
  }) as ComposerAction;

describe("resolveComposerActions ordering", () => {
  it("orders built-ins by the documented ranges within each cluster", () => {
    const resolved = resolveWith({ builtIns: CORE_BUILT_INS() });
    expect(resolved.map((entry) => entry.id)).toEqual([
      "core:mention-0",
      "core:attachment",
      "core:mic",
      "core:send",
    ]);
    expect(COMPOSER_ACTION_ORDER).toMatchObject({
      mention: 100,
      attachment: 200,
      mic: 800,
      overflow: 900,
      send: 1000,
      custom: 500,
    });
  });

  it("defaults a custom action to order 500, between attachment and mic", () => {
    const resolved = resolveWith({
      builtIns: CORE_BUILT_INS(),
      configActions: [button({ id: "host", placement: "end" })],
    });
    expect(resolved.find((entry) => entry.id === "host")?.order).toBe(500);
    expect(resolved.map((entry) => entry.id)).toEqual([
      "core:mention-0",
      "core:attachment",
      "host",
      "core:mic",
      "core:send",
    ]);
  });

  it("clamps an end-cluster action at or after send to 999 with a debug warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolveWith({
      builtIns: CORE_BUILT_INS(),
      configActions: [button({ id: "late", placement: "end", order: 4000 })],
      debug: true,
    });
    expect(resolved.find((entry) => entry.id === "late")?.order).toBe(999);
    expect(resolved[resolved.length - 1].id).toBe("core:send");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("would render after send"),
    );
    warn.mockRestore();
  });

  it("leaves a start-cluster action past 1000 alone (send is an end control)", () => {
    const resolved = resolveWith({
      configActions: [button({ id: "far", placement: "start", order: 5000 })],
    });
    expect(resolved[0].order).toBe(5000);
  });

  it("breaks ties on equal order by contribution order: core, host, plugins", () => {
    const plugin = (id: string): AgentWidgetPlugin => ({
      id,
      contributeComposerActions: () => [button({ id: "tie", order: 500 })],
    });
    const resolved = resolveWith({
      builtIns: [builtIn("core:tie", "start", 500)],
      configActions: [button({ id: "host-tie", order: 500 })],
      plugins: [plugin("p1"), plugin("p2")],
    });
    expect(resolved.map((entry) => entry.id)).toEqual([
      "core:tie",
      "host-tie",
      "p1:tie",
      "p2:tie",
    ]);
  });
});

describe("resolveComposerActions namespacing and duplicates", () => {
  it("namespaces a plugin action as <pluginId>:<id>", () => {
    const resolved = resolveWith({
      plugins: [
        { id: "emoji", contributeComposerActions: () => [button({ id: "pick" })] },
      ],
    });
    expect(resolved[0].id).toBe("emoji:pick");
    expect(resolved[0].pluginId).toBe("emoji");
  });

  it("leaves an id that already carries a namespace untouched", () => {
    const resolved = resolveWith({
      plugins: [
        {
          id: "emoji",
          contributeComposerActions: () => [button({ id: "vendor:pick" })],
        },
      ],
    });
    expect(resolved[0].id).toBe("vendor:pick");
  });

  it("rejects duplicates across core, host, and two plugins; first wins", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolveWith({
      builtIns: [builtIn("core:attachment", "start", 200)],
      configActions: [
        button({ id: "core:attachment", label: "host copy" }),
        button({ id: "shared", label: "host shared" }),
      ],
      plugins: [
        {
          id: "p1",
          contributeComposerActions: () => [
            button({ id: "shared:x", label: "p1 first" }),
          ],
        },
        {
          id: "p2",
          contributeComposerActions: () => [
            button({ id: "shared:x", label: "p2 loses" }),
          ],
        },
      ],
      debug: true,
    });

    expect(resolved.map((entry) => entry.id)).toEqual([
      "core:attachment",
      "shared",
      "shared:x",
    ]);
    // The core built-in kept its slot; the host copy never replaced it.
    expect(resolved[0].source).toBe("core");
    expect(resolved[2].pluginId).toBe("p1");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("survives a plugin whose contribution hook throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolved = resolveWith({
      plugins: [
        {
          id: "bad",
          contributeComposerActions: () => {
            throw new Error("boom");
          },
        },
        { id: "good", contributeComposerActions: () => [button({ id: "ok" })] },
      ],
    });
    expect(resolved.map((entry) => entry.id)).toEqual(["good:ok"]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("runs EVERY plugin hook, unlike renderComposer's first match", () => {
    const resolved = resolveWith({
      plugins: [
        { id: "p1", contributeComposerActions: () => [button({ id: "a" })] },
        { id: "p2", contributeComposerActions: () => [button({ id: "b" })] },
        { id: "p3", contributeComposerActions: () => [button({ id: "c" })] },
      ],
    });
    expect(resolved.map((entry) => entry.id)).toEqual(["p1:a", "p2:b", "p3:c"]);
  });

  it("keeps overflow and auto presentations in the bar for now", () => {
    const resolved = resolveWith({
      configActions: [
        button({ id: "o", presentation: "overflow" }),
        button({ id: "u", presentation: "auto" }),
      ],
    });
    expect(resolved.map((entry) => entry.presentation)).toEqual([
      "overflow",
      "auto",
    ]);
  });
});

// --- renderer --------------------------------------------------------------

type Harness = ReturnType<typeof mountRenderer>;

const mountRenderer = (options: {
  pill?: boolean;
  configActions?: ComposerAction[];
  plugins?: AgentWidgetPlugin[];
  managedMentions?: number;
  getButtonSize?: () => string | undefined;
}) => {
  const elements = options.pill
    ? buildPillComposer({ config })
    : buildComposer({ config });
  document.body.appendChild(elements.footer);
  const bindings = bindComposerSurface(elements.footer)!;

  const state = { current: idleState() };
  const errors: Array<{ error: unknown; actionId: string }> = [];
  const setValue = vi.fn();

  const actionContext: ComposerActionContext = {
    getState: () => state.current,
    getValue: () => "",
    setValue,
    submit: vi.fn(),
    openAttachmentPicker: vi.fn(),
    toggleVoice: vi.fn(),
    requestRender: () => renderer.resolve(),
  };

  const mentionWrappers: HTMLElement[] = [];
  for (let i = 0; i < (options.managedMentions ?? 0); i += 1) {
    const wrapper = document.createElement("div");
    wrapper.className = "persona-send-button-wrapper";
    wrapper.setAttribute("data-test-mention", String(i));
    mentionWrappers.push(wrapper);
  }

  const live = {
    configActions: options.configActions,
    plugins: options.plugins ?? [],
  };

  const renderer = createComposerActionRenderer({
    getBindings: () => bindings,
    collect: () => ({
      builtIns: [
        ...mentionWrappers.map((element, index) => ({
          id: `core:mention-${index}`,
          placement: "start" as const,
          order: COMPOSER_ACTION_ORDER.mention + index,
          element,
          managed: true,
        })),
        {
          id: "core:attachment",
          placement: "start" as const,
          order: COMPOSER_ACTION_ORDER.attachment,
          element: elements.attachmentButtonWrapper,
        },
        {
          id: "core:mic",
          placement: "end" as const,
          order: COMPOSER_ACTION_ORDER.mic,
          element: elements.micButtonWrapper,
        },
        {
          id: "core:send",
          placement: "end" as const,
          order: COMPOSER_ACTION_ORDER.send,
          element: elements.sendButtonWrapper,
        },
      ],
      configActions: live.configActions,
      plugins: live.plugins,
      contributionContext,
      debug: false,
    }),
    actionContext,
    getState: () => state.current,
    ...(options.getButtonSize && { getButtonSize: options.getButtonSize }),
    reportError: (error, info) => errors.push({ error, actionId: info.actionId }),
  });
  renderer.resolve();

  return { elements, bindings, renderer, state, errors, live, setValue };
};

const idsOf = (cluster: HTMLElement): string[] =>
  Array.from(cluster.children).map(
    (child) =>
      child.getAttribute("data-persona-composer-action") ??
      (child.querySelector("[data-persona-composer-submit]")
        ? "core:send"
        : child.querySelector("[data-persona-composer-mic]")
          ? "core:mic"
          : child.querySelector("[data-persona-composer-attachment-button]")
            ? "core:attachment"
            : (child.getAttribute("data-test-mention") ?? "?"))
  );

const actionButton = (harness: Harness, id: string): HTMLButtonElement =>
  harness.elements.footer.querySelector<HTMLButtonElement>(
    `[data-persona-composer-action="${id}"] button`
  )!;

describe("composer action renderer placement", () => {
  it("places contributions around the built-in anchors without moving them", () => {
    const harness = mountRenderer({
      configActions: [
        button({ id: "early", placement: "start", order: 150 }),
        button({ id: "late", placement: "end", order: 600 }),
      ],
      managedMentions: 2,
    });

    expect(idsOf(harness.bindings.actionsStart)).toEqual([
      "0",
      "1",
      "early",
      "core:attachment",
    ]);
    expect(idsOf(harness.bindings.actionsEnd)).toEqual([
      "late",
      "core:mic",
      "core:send",
    ]);
  });

  it("routes mention affordances through the registry, leftmost in channel order", () => {
    const harness = mountRenderer({ managedMentions: 3 });
    expect(idsOf(harness.bindings.actionsStart)).toEqual([
      "0",
      "1",
      "2",
      "core:attachment",
    ]);
  });

  it("resolves the same list for the full and pill composers", () => {
    const actions = [
      button({ id: "s", placement: "start", order: 150 }),
      button({ id: "e", placement: "end", order: 600 }),
    ];
    const full = mountRenderer({ configActions: actions, managedMentions: 1 });
    const pill = mountRenderer({
      pill: true,
      configActions: actions,
      managedMentions: 1,
    });

    const ids = (harness: Harness) => harness.renderer.getResolved().map((r) => r.id);
    expect(ids(pill)).toEqual(ids(full));
    expect(idsOf(pill.bindings.actionsStart)).toEqual(
      idsOf(full.bindings.actionsStart)
    );
    expect(idsOf(pill.bindings.actionsEnd)).toEqual(
      idsOf(full.bindings.actionsEnd)
    );
  });

  it("leaves the attachment built-in's classes and data attributes untouched", () => {
    const harness = mountRenderer({ configActions: [button({ id: "x" })] });
    const attachment = harness.elements.attachmentButton!;
    expect(attachment.getAttribute("data-persona-composer-attachment-button")).toBe("");
    expect(attachment.classList.contains("persona-attachment-button")).toBe(true);
    expect(attachment.parentElement).toBe(harness.elements.attachmentButtonWrapper);
    expect(harness.elements.attachmentButtonWrapper!.parentElement).toBe(
      harness.bindings.actionsStart
    );
  });

  it("leaves the send built-in's submit contract untouched", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x", placement: "end" })],
    });
    const send = harness.elements.sendButton;
    expect(send.getAttribute("type")).toBe("submit");
    expect(send.getAttribute("data-persona-composer-submit")).toBe("");
    expect(harness.elements.sendButtonWrapper.parentElement).toBe(
      harness.bindings.actionsEnd
    );
  });
});

describe("composer action renderer accessibility", () => {
  it("renders a type=button control with the label as its accessible name", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x", label: "Insert emoji", iconName: "sparkles" })],
    });
    const el = actionButton(harness, "x");
    expect(el.type).toBe("button");
    expect(el.getAttribute("aria-label")).toBe("Insert emoji");
    expect(el.querySelector("svg")).not.toBeNull();
    expect(el.classList.contains("persona-composer-action-button")).toBe(true);
  });

  it("renders shortLabel as visible text while label stays the accessible name", () => {
    const harness = mountRenderer({
      configActions: [
        button({ id: "x", label: "Clear the draft", shortLabel: "Clear" }),
      ],
    });
    const el = actionButton(harness, "x");
    expect(el.textContent).toBe("Clear");
    expect(el.getAttribute("aria-label")).toBe("Clear the draft");
  });

  it("omits aria-pressed unless pressed is set, and syncs it on re-contribution", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x" })],
    });
    expect(actionButton(harness, "x").hasAttribute("aria-pressed")).toBe(false);

    harness.live.configActions = [button({ id: "x", pressed: false })];
    harness.renderer.resolve();
    expect(actionButton(harness, "x").getAttribute("aria-pressed")).toBe("false");

    harness.live.configActions = [button({ id: "x", pressed: true })];
    harness.renderer.resolve();
    expect(actionButton(harness, "x").getAttribute("aria-pressed")).toBe("true");
  });

  it("stamps the streaming-disable hook the composer already understands", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x", disableWhenStreaming: true })],
    });
    expect(
      actionButton(harness, "x").hasAttribute(
        "data-persona-composer-disable-when-streaming"
      )
    ).toBe(true);
  });
});

describe("composer action renderer control sizing", () => {
  it("sizes icon-only action buttons from the control-size token, not an inline box", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x", iconName: "sparkles" })],
    });
    const el = actionButton(harness, "x");
    expect(el.classList.contains("persona-composer-control")).toBe(true);
    expect(el.classList.contains("persona-composer-control--glyph")).toBe(true);
    expect(el.style.width).toBe("");
    expect(el.style.height).toBe("");
    expect(el.style.minWidth).toBe("");
    expect(el.style.minHeight).toBe("");
    expect(el.querySelector("svg")?.getAttribute("width")).toBe("24");
  });

  it("keeps text-label action buttons on the token height with width from padding", () => {
    const harness = mountRenderer({
      configActions: [
        button({ id: "x", label: "Clear the draft", shortLabel: "Clear" }),
      ],
    });
    const el = actionButton(harness, "x");
    expect(el.classList.contains("persona-composer-control")).toBe(true);
    expect(
      el.classList.contains("persona-composer-action-button--text")
    ).toBe(true);
    // Both come from CSS: the base rule's height, the text rule's auto width.
    expect(el.style.height).toBe("");
    expect(el.style.width).toBe("");
    expect(el.style.fontSize).toBe("");
  });

  it("lets an explicit getButtonSize override the token inline", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x", iconName: "sparkles" })],
      getButtonSize: () => "32px",
    });
    const el = actionButton(harness, "x");
    expect(el.style.width).toBe("32px");
    expect(el.style.height).toBe("32px");
    expect(el.style.minWidth).toBe("32px");
    expect(el.style.minHeight).toBe("32px");
  });
});

describe("composer action renderer async lifecycle", () => {
  it("marks the button aria-busy while an async onSelect is pending", async () => {
    let settle: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const harness = mountRenderer({
      configActions: [button({ id: "x", onSelect: () => pending })],
    });
    const el = actionButton(harness, "x");

    el.click();
    expect(el.getAttribute("aria-busy")).toBe("true");
    settle();
    await pending;
    await Promise.resolve();
    expect(el.hasAttribute("aria-busy")).toBe(false);
  });

  it("ignores repeat activation while the previous run is pending", async () => {
    let settle: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const onSelect = vi.fn(() => pending);
    const harness = mountRenderer({
      configActions: [button({ id: "x", onSelect })],
    });
    const el = actionButton(harness, "x");

    el.click();
    el.click();
    el.click();
    expect(onSelect).toHaveBeenCalledTimes(1);

    settle();
    await pending;
    await Promise.resolve();
    el.click();
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("routes a rejected onSelect through the error path and clears busy", async () => {
    const failure = new Error("nope");
    const harness = mountRenderer({
      configActions: [
        button({ id: "x", onSelect: () => Promise.reject(failure) }),
      ],
    });
    const el = actionButton(harness, "x");
    el.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.errors).toEqual([{ error: failure, actionId: "x" }]);
    expect(el.hasAttribute("aria-busy")).toBe(false);
  });

  it("routes a synchronous throw through the error path", () => {
    const failure = new Error("sync boom");
    const harness = mountRenderer({
      configActions: [
        button({
          id: "x",
          onSelect: () => {
            throw failure;
          },
        }),
      ],
    });
    actionButton(harness, "x").click();
    expect(harness.errors).toEqual([{ error: failure, actionId: "x" }]);
  });

  it("hands the capability context, never the session, to onSelect", () => {
    const seen: string[] = [];
    const harness = mountRenderer({
      configActions: [
        button({
          id: "x",
          onSelect: (ctx) => {
            seen.push(...Object.keys(ctx));
            ctx.setValue("hi");
          },
        }),
      ],
    });
    actionButton(harness, "x").click();
    expect(seen.sort()).toEqual([
      "getState",
      "getValue",
      "openAttachmentPicker",
      "requestRender",
      "setValue",
      "submit",
      "toggleVoice",
    ]);
    expect(harness.setValue).toHaveBeenCalledWith("hi");
  });
});

describe("composer action renderer state re-evaluation", () => {
  it("re-evaluates visible on every composer-state change", () => {
    const harness = mountRenderer({
      configActions: [
        button({
          id: "x",
          order: 150,
          visible: (state) => state.text.length > 0,
        }),
      ],
    });
    expect(actionButton(harness, "x")).toBeNull();

    harness.state.current = idleState({ text: "hello" });
    harness.renderer.sync();
    expect(actionButton(harness, "x")).not.toBeNull();
    expect(idsOf(harness.bindings.actionsStart)).toEqual(["x", "core:attachment"]);

    harness.state.current = idleState({ text: "" });
    harness.renderer.sync();
    expect(actionButton(harness, "x")).toBeNull();
  });

  it("re-evaluates disabled on every composer-state change", () => {
    const harness = mountRenderer({
      configActions: [
        button({ id: "x", disabled: (state) => state.phase !== "idle" }),
      ],
    });
    expect(actionButton(harness, "x").disabled).toBe(false);

    harness.state.current = idleState({ phase: "preparing" });
    harness.renderer.sync();
    expect(actionButton(harness, "x").disabled).toBe(true);
  });

  it("disables a disableWhenStreaming action while streaming", () => {
    const harness = mountRenderer({
      configActions: [button({ id: "x", disableWhenStreaming: true })],
    });
    expect(actionButton(harness, "x").disabled).toBe(false);

    harness.state.current = idleState({ phase: "streaming" });
    harness.renderer.sync();
    expect(actionButton(harness, "x").disabled).toBe(true);

    harness.state.current = idleState();
    harness.renderer.sync();
    expect(actionButton(harness, "x").disabled).toBe(false);
  });

  it("adds, changes, and removes actions when the contributed list changes", () => {
    const harness = mountRenderer({ configActions: [button({ id: "x" })] });
    expect(actionButton(harness, "x").getAttribute("aria-label")).toBe("Action A");

    harness.live.configActions = [
      button({ id: "x", label: "Renamed" }),
      button({ id: "y", label: "Added" }),
    ];
    harness.renderer.resolve();
    expect(actionButton(harness, "x").getAttribute("aria-label")).toBe("Renamed");
    expect(actionButton(harness, "y")).not.toBeNull();

    harness.live.configActions = [];
    harness.renderer.resolve();
    expect(actionButton(harness, "x")).toBeNull();
    expect(actionButton(harness, "y")).toBeNull();
  });
});

describe("composer custom actions", () => {
  const customAction = (
    id: string,
    onDestroy: () => void,
    render = (): HTMLElement => {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Prompt templates");
      return select;
    }
  ): ComposerAction =>
    ({
      id,
      kind: "custom",
      placement: "end",
      order: 600,
      label: "Prompt templates",
      render: () => ({ element: render(), destroy: onDestroy }),
    }) as ComposerAction;

  it("places the returned element as-is, wrapping nothing around it", () => {
    const harness = mountRenderer({
      configActions: [customAction("c", () => {})],
    });
    const element = harness.elements.footer.querySelector(
      '[data-persona-composer-action="c"]'
    )!;
    expect(element.tagName).toBe("SELECT");
    expect(element.getAttribute("aria-label")).toBe("Prompt templates");
    expect(idsOf(harness.bindings.actionsEnd)).toEqual([
      "c",
      "core:mic",
      "core:send",
    ]);
  });

  it("runs destroy when the action is removed", () => {
    const destroy = vi.fn();
    const harness = mountRenderer({ configActions: [customAction("c", destroy)] });
    harness.live.configActions = [];
    harness.renderer.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("runs destroy when the renderer is destroyed (composer rebuild, widget destroy)", () => {
    const destroy = vi.fn();
    const harness = mountRenderer({ configActions: [customAction("c", destroy)] });
    harness.renderer.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(
      harness.elements.footer.querySelector('[data-persona-composer-action="c"]')
    ).toBeNull();
  });

  it("keeps the live element across resolves so internal state survives", () => {
    const destroy = vi.fn();
    const action = customAction("c", destroy);
    const harness = mountRenderer({ configActions: [action] });
    const first = harness.elements.footer.querySelector(
      '[data-persona-composer-action="c"]'
    );
    harness.live.configActions = [action];
    harness.renderer.resolve();
    expect(
      harness.elements.footer.querySelector('[data-persona-composer-action="c"]')
    ).toBe(first);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("disables a custom action through aria-disabled and the native flag", () => {
    const harness = mountRenderer({
      configActions: [
        {
          ...(customAction("c", () => {}) as Record<string, unknown>),
          disabled: (state: Readonly<ComposerState>) => state.phase === "streaming",
        } as unknown as ComposerAction,
      ],
    });
    harness.state.current = idleState({ phase: "streaming" });
    harness.renderer.sync();
    const element = harness.elements.footer.querySelector<HTMLSelectElement>(
      '[data-persona-composer-action="c"]'
    )!;
    expect(element.getAttribute("aria-disabled")).toBe("true");
    expect(element.disabled).toBe(true);
  });
});

describe("two plugins coexisting", () => {
  const emojiPlugin: AgentWidgetPlugin = {
    id: "emoji",
    contributeComposerActions: () => [
      button({ id: "insert", placement: "start", order: 250, label: "Insert emoji" }),
    ],
  };
  const destroyed = vi.fn();
  const templatesPlugin: AgentWidgetPlugin = {
    id: "templates",
    contributeComposerActions: () => [
      {
        id: "pick",
        kind: "custom",
        placement: "end",
        order: 600,
        label: "Prompt templates",
        render: () => ({
          element: document.createElement("select"),
          destroy: destroyed,
        }),
      } as ComposerAction,
      button({
        id: "expand",
        placement: "end",
        order: 700,
        label: "Expand prompt",
      }),
    ],
  };

  it("renders both plugins' actions without either claiming the composer", () => {
    const harness = mountRenderer({
      plugins: [emojiPlugin, templatesPlugin],
      managedMentions: 1,
    });
    expect(idsOf(harness.bindings.actionsStart)).toEqual([
      "0",
      "core:attachment",
      "emoji:insert",
    ]);
    expect(idsOf(harness.bindings.actionsEnd)).toEqual([
      "templates:pick",
      "templates:expand",
      "core:mic",
      "core:send",
    ]);
  });

  it("cleans up only the removed plugin's actions", () => {
    destroyed.mockClear();
    const harness = mountRenderer({ plugins: [emojiPlugin, templatesPlugin] });
    harness.live.plugins = [emojiPlugin];
    harness.renderer.resolve();

    expect(destroyed).toHaveBeenCalledTimes(1);
    expect(
      harness.elements.footer.querySelector(
        '[data-persona-composer-action="templates:expand"]'
      )
    ).toBeNull();
    expect(
      harness.elements.footer.querySelector(
        '[data-persona-composer-action="emoji:insert"]'
      )
    ).not.toBeNull();
  });
});
