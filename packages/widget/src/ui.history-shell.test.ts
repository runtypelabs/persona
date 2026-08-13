// @vitest-environment jsdom

/**
 * Shell wiring for the visitor conversation history surface
 * (`docs/visitor-history-implementation-plan.md` D7): header button, panel/rail
 * hosts, navigation/transition table, open flow, prepend, and confirmations.
 *
 * Runs against the in-memory demo provider through the internal registry, so no
 * transport or credential plumbing is involved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
  type DemoHistoryProvider,
  type DemoHistoryProviderOptions,
} from "./internal/demo-history-provider";
import type { AgentWidgetPlugin } from "./plugins/types";
import { setMacPlatformOverride } from "./utils/shortcuts";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [
      { id: "a1", role: "user", content: "where is my order" },
      { id: "a2", role: "assistant", content: "it ships tomorrow" },
      { id: "a3", role: "user", content: "thanks" },
    ],
  },
  {
    id: "conv-b",
    title: "Refund request",
    targetId: null,
    messages: [
      { id: "b1", role: "user", content: "i need a refund" },
      { id: "b2", role: "assistant", content: "started your refund" },
    ],
  },
];

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

type SetupOptions = {
  config?: Record<string, unknown>;
  provider?: DemoHistoryProviderOptions;
  /** Replaces the demo provider entirely (e.g. to add `resetDevice`). */
  factory?: () => DemoHistoryProvider;
  historyFeature?: Record<string, unknown> | null;
};

const setup = (options: SetupOptions = {}) => {
  const provider =
    options.factory?.() ??
    createDemoHistoryProvider({ conversations: SEEDS, ...options.provider });
  setHistoryProviderFactory(() => provider);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const historyFeature =
    options.historyFeature === undefined ? { enabled: true } : options.historyFeature;
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...(historyFeature ? { features: { history: historyFeature } } : {}),
    ...options.config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller, provider };
};

const historyButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]");
const historyRoot = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-view");
const bodyOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("#persona-scroll-container")!;
const footerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-footer") ??
  mount.querySelector<HTMLElement>("[data-test-gate]")!;
/** Every header builder (default, minimal, composer-bar placeholder) marks it. */
const headerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>('[data-persona-theme-zone="header"]')!;
/** Shell-owned wrapper holding the Messages bar inside the widget header. */
const headerHostOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-header-host");
const suppressedIn = (header: HTMLElement) =>
  Array.from(header.querySelectorAll("[data-persona-history-suppressed]"));
/** Header children the visitor can still see while Messages owns the bar. */
const visibleHeaderChildren = (header: HTMLElement) =>
  Array.from(header.children).filter(
    (child) =>
      !child.hasAttribute("data-persona-history-suppressed") &&
      !child.classList.contains("persona-history-header-host")
  );
const rowOf = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(`[data-persona-history-conversation="${id}"]`);
const dialogOf = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

/** Give the container a rail-capable width; jsdom reports 0 for everything. */
const setContainerWidth = (mount: HTMLElement, width: number) => {
  const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  return container;
};

/** Enter/Space synthesize a click with detail 0; a pointer press reports 1. */
const openHistoryUI = async (
  mount: HTMLElement,
  opts?: { keyboard?: boolean }
) => {
  historyButton(mount)!.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: opts?.keyboard === true ? 0 : 1,
    })
  );
  await flush();
};

describe("history shell", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    // The loader's production path is a sibling-URL / external-subpath import.
    setHistoryViewLoader(async () => ({ createHistoryView }));
  });

  afterEach(() => {
    setHistoryProviderFactory(null);
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
    vi.restoreAllMocks();
  });

  describe("header button", () => {
    it("renders a token-sized Messages control before the close affordance", () => {
      const { mount } = setup();
      const button = historyButton(mount);
      expect(button).not.toBeNull();
      expect(button!.getAttribute("aria-label")).toBe("Messages");
      // Box and glyph come from the header control tokens, not an inline size.
      expect(button!.classList.contains("persona-header-control")).toBe(true);
      expect(button!.classList.contains("persona-header-control--glyph")).toBe(true);
      expect(button!.style.width).toBe("");
      expect(button!.style.minWidth).toBe("");
      expect(button!.querySelector("svg")).not.toBeNull();
      // The styled tooltip reads the live aria-label; a title would double it.
      expect(button!.hasAttribute("title")).toBe(false);
    });

    it("joins the minimal layout's trailing cluster before the close control", () => {
      const { mount } = setup({
        config: { layout: { header: { layout: "minimal" } } },
      });
      const button = historyButton(mount)!;
      const closeWrapper = mount.querySelector<HTMLButtonElement>(
        'button[aria-label="Close chat"]'
      )!.parentElement!;
      // Same cluster, close outermost.
      expect(button.parentElement!.parentElement).toBe(closeWrapper.parentElement);
      expect(
        button.compareDocumentPosition(closeWrapper) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("does not render when the feature is disabled", () => {
      const { mount } = setup({ historyFeature: { enabled: false } });
      expect(historyButton(mount)).toBeNull();
    });

    it("does not render without a provider", () => {
      setHistoryProviderFactory(null);
      const mount = document.createElement("div");
      document.body.appendChild(mount);
      mounts.push(mount);
      const controller = createAgentExperience(mount, {
        apiUrl: "https://api.example.com/chat",
        launcher: { enabled: false },
        persistState: false,
        features: { history: { enabled: true } },
      } as unknown as Parameters<typeof createAgentExperience>[1]);
      controllers.push(controller);
      expect(historyButton(mount)).toBeNull();
    });

    it("relabels the visible start-over affordance to New conversation", () => {
      const { mount } = setup({
        config: { launcher: { enabled: false, clearChat: { enabled: true } } },
      });
      const clear = mount.querySelector<HTMLButtonElement>(
        'button[aria-label="New conversation"]'
      );
      expect(clear).not.toBeNull();
      expect(clear).not.toBe(historyButton(mount));
    });

    it("mounts and unmounts through controller.update()", () => {
      const { mount, controller } = setup({ historyFeature: { enabled: false } });
      expect(historyButton(mount)).toBeNull();
      controller.update({ features: { history: { enabled: true } } });
      expect(historyButton(mount)).not.toBeNull();
      controller.update({ features: { history: { enabled: false } } });
      expect(historyButton(mount)).toBeNull();
    });

    it("removes an already-rendered button when availability degrades", () => {
      let notify: ((available: boolean) => void) | null = null;
      const base = createDemoHistoryProvider({ conversations: SEEDS });
      const { mount } = setup({
        factory: () =>
          Object.assign(Object.create(Object.getPrototypeOf(base)), base, {
            subscribeAvailability: (callback: (available: boolean) => void) => {
              notify = callback;
              return () => {
                notify = null;
              };
            },
          }) as DemoHistoryProvider,
      });
      expect(historyButton(mount)).not.toBeNull();
      notify!(false);
      expect(historyButton(mount)).toBeNull();
    });
  });

  describe("panel host", () => {
    it("swaps the header's contents, hides transcript and composer, then restores them", async () => {
      const { mount } = setup();
      const body = bodyOf(mount);
      const footer = footerOf(mount);
      const header = headerOf(mount);
      const originals = Array.from(header.children);

      await openHistoryUI(mount);
      expect(historyRoot(mount)).not.toBeNull();
      expect(body.style.display).toBe("none");
      expect(body.getAttribute("aria-hidden")).toBe("true");
      expect(body.hasAttribute("inert")).toBe(true);
      expect(footer.hidden).toBe(true);
      expect(footer.getAttribute("aria-hidden")).toBe("true");
      expect(footer.hasAttribute("inert")).toBe(true);
      // One persistent bar: the header stays, only its contents change.
      expect(header.style.display).not.toBe("none");
      expect(header.hasAttribute("aria-hidden")).toBe(false);
      expect(header.hasAttribute("inert")).toBe(false);
      const host = headerHostOf(mount)!;
      expect(host.parentElement).toBe(header);
      expect(host.querySelector(".persona-history-topbar")).not.toBeNull();
      expect(historyRoot(mount)!.querySelector(".persona-history-topbar")).toBeNull();
      expect(suppressedIn(header)).toEqual(originals);
      expect(visibleHeaderChildren(header)).toEqual([]);

      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="close"]')!
        .click();
      await flush();

      expect(historyRoot(mount)).toBeNull();
      expect(body.style.display).not.toBe("none");
      expect(body.hasAttribute("inert")).toBe(false);
      expect(body.hasAttribute("aria-hidden")).toBe(false);
      expect(footer.hidden).toBe(false);
      expect(footer.hasAttribute("inert")).toBe(false);
      expect(header.style.display).not.toBe("none");
      expect(header.hasAttribute("inert")).toBe(false);
      expect(header.hasAttribute("aria-hidden")).toBe(false);
      expect(headerHostOf(mount)).toBeNull();
      expect(suppressedIn(header)).toEqual([]);
      expect(Array.from(header.children)).toEqual(originals);
      // The invoker is suppressed until this restores it, so chrome comes first.
      expect(document.activeElement).toBe(historyButton(mount));
    });

    it("re-homes the bar into a shell header rebuilt by update() while Messages is open", async () => {
      const { mount, controller } = setup({
        config: { layout: { header: { layout: "default" } } },
      });
      await openHistoryUI(mount);
      const first = headerOf(mount);
      const host = headerHostOf(mount)!;
      expect(host.parentElement).toBe(first);

      controller.update({ layout: { header: { layout: "minimal" } } });
      await flush();

      const replacement = headerOf(mount);
      expect(replacement).not.toBe(first);
      expect(replacement.style.display).not.toBe("none");
      expect(replacement.hasAttribute("inert")).toBe(false);
      // Same wrapper instance: focus inside the bar survives the rebuild.
      expect(headerHostOf(mount)).toBe(host);
      expect(host.parentElement).toBe(replacement);
      expect(host.querySelector(".persona-history-topbar")).not.toBeNull();
      expect(visibleHeaderChildren(replacement)).toEqual([]);
      // Including the Messages control the rebuild re-created: suppression
      // lands on its wrapper, which is the header's direct child.
      expect(
        historyButton(mount)!.parentElement!.hasAttribute(
          "data-persona-history-suppressed"
        )
      ).toBe(true);

      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="close"]')!
        .click();
      await flush();
      expect(headerHostOf(mount)).toBeNull();
      expect(suppressedIn(replacement)).toEqual([]);
    });

    it("falls back to hiding the header entirely when there is none to host in", async () => {
      const { mount } = setup({ config: { layout: { showHeader: false } } });
      await openHistoryUI(mount);
      const header = headerOf(mount);

      expect(headerHostOf(mount)).toBeNull();
      expect(header.style.display).toBe("none");
      expect(header.getAttribute("aria-hidden")).toBe("true");
      expect(header.hasAttribute("inert")).toBe(true);
      // The bar rides inside the view element instead.
      expect(historyRoot(mount)!.querySelector(".persona-history-topbar")).not.toBeNull();
    });

    it("re-applies hidden/inert to a replacement composer footer", async () => {
      let requestRender: (() => void) | null = null;
      let gated = true;
      const plugin: AgentWidgetPlugin = {
        id: "gate",
        renderComposer: (ctx) => {
          requestRender = ctx.requestRender;
          if (!gated) return null;
          const footer = document.createElement("div");
          footer.setAttribute("data-test-gate", "");
          return footer;
        },
      };
      const { mount } = setup({ config: { plugins: [plugin] } });
      await openHistoryUI(mount);
      const first = mount.querySelector<HTMLElement>("[data-test-gate]")!;
      expect(first.hidden).toBe(true);

      gated = false;
      requestRender!();
      await flush();

      const replacement = footerOf(mount);
      expect(replacement).not.toBe(first);
      expect(replacement.hidden).toBe(true);
      expect(replacement.getAttribute("aria-hidden")).toBe("true");
      expect(replacement.hasAttribute("inert")).toBe(true);
    });

    it("suppresses the scroll-to-bottom affordance while the panel is open", async () => {
      const { mount } = setup();
      await openHistoryUI(mount);
      const jump = mount.querySelector<HTMLElement>("[data-persona-scroll-to-bottom]");
      expect(jump === null || jump.style.display === "none").toBe(true);
    });
  });

  describe("rail host", () => {
    const railSetup = async (rail?: Record<string, unknown>) => {
      const result = setup({
        historyFeature: { enabled: true, presentation: "rail", ...(rail ? { rail } : {}) },
      });
      setContainerWidth(result.mount, 900);
      await openHistoryUI(result.mount);
      return result;
    };

    it("docks the navigation ahead of the conversation at 260px by default", async () => {
      const { mount } = await railSetup();
      const shell = mount.querySelector<HTMLElement>(".persona-history-rail-shell")!;
      const host = shell.querySelector<HTMLElement>(".persona-history-rail-host")!;
      expect(shell.firstElementChild).toBe(host);
      expect(host.style.flex).toBe("0 0 260px");
      // The divider faces the conversation, so a leading rail draws it right.
      expect(host.style.borderRight).not.toBe("");
      expect(host.style.borderLeft).toBe("");
    });

    it("flips to the trailing edge and takes a clamped width from config", async () => {
      const { mount } = await railSetup({ side: "right", width: 900 });
      const shell = mount.querySelector<HTMLElement>(".persona-history-rail-shell")!;
      const host = shell.querySelector<HTMLElement>(".persona-history-rail-host")!;
      expect(shell.lastElementChild).toBe(host);
      expect(host.style.flex).toBe("0 0 400px");
      expect(host.style.borderLeft).not.toBe("");
      expect(host.style.borderRight).toBe("");
      // The conversation column still gives the transcript and composer back.
      expect(bodyOf(mount).closest(".persona-history-rail-conversation")).not.toBeNull();
    });

    it("mirrors the bar order for a rail docked on the right", async () => {
      const { mount, controller } = await railSetup();
      const bar = () =>
        mount.querySelector<HTMLElement>(".persona-history-topbar")!;
      const focusKeys = () =>
        Array.from(bar().children).map((child) =>
          child.getAttribute("data-persona-history-focus")
        );
      // Left rail: identity leads, the toggle takes the inner edge.
      expect(focusKeys()).toEqual([null, "collapse"]);

      controller.update({
        features: { history: { rail: { side: "right" } } },
      } as never);
      await flush();
      expect(focusKeys()).toEqual(["collapse", null]);
      expect(
        historyRoot(mount)!.classList.contains("persona-history-view--rail-right")
      ).toBe(true);
    });

    it("renders the configured rail header brand and re-renders it on collapse", async () => {
      const calls: boolean[] = [];
      const { mount } = await railSetup({
        renderHeader: ({ collapsed }: { collapsed: boolean }) => {
          calls.push(collapsed);
          if (collapsed) return null;
          const brand = document.createElement("span");
          brand.dataset.brand = "";
          brand.textContent = "Acme";
          return brand;
        },
      });
      const group = () =>
        mount.querySelector<HTMLElement>(".persona-history-heading-group")!;
      expect(calls).toEqual([false]);
      expect(group().querySelector("[data-brand]")?.textContent).toBe("Acme");
      // The heading stays for the region's accessible name.
      const title = mount.querySelector<HTMLElement>(".persona-history-title")!;
      expect(title.classList.contains("persona-history-sr-only")).toBe(true);
      expect(title.textContent).toBe("Messages");

      mount
        .querySelector<HTMLButtonElement>(
          '[data-persona-history-focus="collapse"]'
        )!
        .click();
      await flush();
      expect(calls).toEqual([false, true]);
      expect(group().querySelector("[data-brand]")).toBeNull();
    });

    it("resolves one brand declaration into both rail faces", async () => {
      const { mount } = await railSetup({
        brand: { iconUrl: "https://cdn.example/mark.png" },
      });
      const marks = Array.from(
        mount.querySelectorAll<HTMLImageElement>(".persona-history-brand-mark > img")
      );
      // The heading mark and the collapsed toggle face are separate copies.
      expect(marks).toHaveLength(2);
      for (const mark of marks) {
        expect(mark.src).toBe("https://cdn.example/mark.png");
        expect(mark.alt).toBe("");
        expect(mark.getAttribute("aria-hidden")).toBe("true");
      }
      // The wordmark beside the heading mark is the view title.
      expect(
        mount.querySelector<HTMLElement>(".persona-history-wordmark")?.textContent
      ).toBe("Messages");
      expect(
        mount
          .querySelector<HTMLElement>('[data-persona-history-focus="collapse"]')
          ?.querySelector(".persona-history-toggle-brand > img")
      ).not.toBeNull();
    });

    it("drops the brand and warns once for an unknown lucide name", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { mount } = await railSetup({ brand: { icon: "not-a-real-icon" } });
      expect(mount.querySelector(".persona-history-brand-mark")).toBeNull();
      expect(mount.querySelector(".persona-history-toggle-brand")).toBeNull();
      // The plain title comes back, visible, as if no brand were declared.
      const title = mount.querySelector<HTMLElement>(".persona-history-title")!;
      expect(title.classList.contains("persona-history-sr-only")).toBe(false);
      // Resolved once for both faces, so the registry warns once.
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    describe("collapse shortcut", () => {
      beforeEach(() => setMacPlatformOverride(false));
      afterEach(() => setMacPlatformOverride(null));

      const collapseToggle = (mount: HTMLElement) =>
        mount.querySelector<HTMLButtonElement>(
          '[data-persona-history-focus="collapse"]'
        )!;
      const railWidth = (mount: HTMLElement) =>
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex;
      const pressModB = (target: EventTarget) =>
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "b",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );

      it("binds nothing by default, so an embed never claims the host's keys", async () => {
        const { mount } = await railSetup();
        expect(railWidth(mount)).toBe("0 0 260px");
        pressModB(collapseToggle(mount));
        await flush();
        expect(railWidth(mount)).toBe("0 0 260px");
        expect(collapseToggle(mount).hasAttribute("aria-keyshortcuts")).toBe(false);
      });

      it("collapses and expands from the configured combo", async () => {
        const { mount } = await railSetup({ collapseShortcut: "mod+b" });
        pressModB(collapseToggle(mount));
        await flush();
        expect(railWidth(mount)).toBe("0 0 52px");
        pressModB(collapseToggle(mount));
        await flush();
        expect(railWidth(mount)).toBe("0 0 260px");
      });

      it("keeps a widget-scoped binding out of the rest of the page", async () => {
        const { mount } = await railSetup({ collapseShortcut: "mod+b" });
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        pressModB(outside);
        await flush();
        expect(railWidth(mount)).toBe("0 0 260px");
      });

      it("answers a page-scoped binding from outside the widget", async () => {
        const { mount } = await railSetup({
          collapseShortcut: "mod+b",
          collapseShortcutScope: "page",
        });
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        pressModB(outside);
        await flush();
        expect(railWidth(mount)).toBe("0 0 52px");
      });

      it("stamps the toggle with aria-keyshortcuts and hints it in the tooltip", async () => {
        const { mount } = await railSetup({ collapseShortcut: "mod+b" });
        const toggle = collapseToggle(mount);
        expect(toggle.getAttribute("aria-keyshortcuts")).toBe("Control+B");

        toggle.dispatchEvent(new MouseEvent("mouseenter"));
        const tooltip = document.querySelector(".persona-control-tooltip")!;
        expect(
          tooltip.querySelector(".persona-control-tooltip__label")!.textContent
        ).toBe("Collapse conversation list");
        expect(
          tooltip.querySelector(".persona-control-tooltip__hint")!.textContent
        ).toBe("Ctrl+B");
      });
    });

    it("resolves declarative section icons and runs their callbacks", async () => {
      const onSelect = vi.fn();
      const { mount } = await railSetup({
        sections: [
          {
            id: "workspace",
            title: "Workspace",
            items: [
              { id: "projects", label: "Projects", icon: "folder", onSelect },
              {
                id: "library",
                label: "Library",
                iconUrl: "https://cdn.example.com/library.png",
                badge: "12",
                onSelect: () => {},
              },
            ],
          },
        ],
      });

      const section = mount.querySelector<HTMLElement>(
        '[data-persona-rail-section="workspace"]'
      )!;
      // Default placement is above the list, after the new-conversation row.
      expect(section.previousElementSibling?.className).toContain(
        "persona-history-new"
      );
      const projects = section.querySelector<HTMLButtonElement>(
        '[data-persona-rail-item="projects"]'
      )!;
      expect(projects.querySelector("svg")).not.toBeNull();

      const image = section.querySelector<HTMLImageElement>(
        '[data-persona-rail-item="library"] img'
      )!;
      expect(image.getAttribute("src")).toBe(
        "https://cdn.example.com/library.png"
      );
      expect(image.getAttribute("alt")).toBe("");
      expect(image.getAttribute("aria-hidden")).toBe("true");
      expect(
        section.querySelector('[data-persona-rail-item="library"] .persona-history-nav-badge')
          ?.textContent
      ).toBe("12");

      projects.click();
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("warns once for an unknown lucide name and renders the row label-only", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { mount, controller } = await railSetup({
        sections: [
          {
            id: "workspace",
            items: [
              { id: "projects", label: "Projects", icon: "not-an-icon", onSelect: () => {} },
            ],
          },
        ],
      });
      const projects = () =>
        mount.querySelector<HTMLButtonElement>(
          '[data-persona-rail-item="projects"]'
        )!;
      expect(projects().querySelector("svg")).toBeNull();
      expect(projects().textContent).toBe("Projects");
      expect(warn).toHaveBeenCalledTimes(1);

      // A presentation flip re-attaches the rows it already built: no re-warn.
      controller.update({
        features: { history: { presentation: "panel" } },
      } as never);
      await flush();
      controller.update({
        features: { history: { presentation: "rail" } },
      } as never);
      await flush();
      expect(projects().textContent).toBe("Projects");
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it("keeps the transcript and composer operable beside the navigation", async () => {
      const { mount } = await railSetup();
      const rail = mount.querySelector<HTMLElement>(".persona-history-rail-host");
      expect(rail).not.toBeNull();
      expect(rail!.contains(historyRoot(mount))).toBe(true);
      const body = bodyOf(mount);
      expect(body.style.display).not.toBe("none");
      expect(body.hasAttribute("inert")).toBe(false);
      expect(footerOf(mount).hidden).toBe(false);
      // The rail runs the full widget height, so the shell header rides inside
      // the conversation column: visible, never inert, never suppressed.
      const header = headerOf(mount);
      expect(header.closest(".persona-history-rail-conversation")).not.toBeNull();
      expect(header.style.display).not.toBe("none");
      expect(header.hasAttribute("inert")).toBe(false);
      expect(headerHostOf(mount)).toBeNull();
      expect(suppressedIn(header)).toEqual([]);
      // The rail host is a sibling of the column, not below the header.
      expect(rail!.parentElement).toBe(
        header.closest(".persona-history-rail-conversation")!.parentElement
      );
      // Its own bar rides inside the rail, led by the collapse toggle.
      const bar = historyRoot(mount)!.querySelector<HTMLElement>(
        ".persona-history-topbar"
      )!;
      expect(bar.classList.contains("persona-history-topbar--shell")).toBe(false);
      expect(
        bar
          .querySelector('[data-persona-history-focus="collapse"]')
          ?.getAttribute("aria-label")
      ).toBe("Collapse conversation list");
      expect(historyButton(mount)!.getAttribute("aria-expanded")).toBe("true");
    });

    it("stays open on selection and marks the active row", async () => {
      const { mount } = await railSetup();
      rowOf(mount, "conv-a")!.click();
      await flush(20);
      expect(historyRoot(mount)).not.toBeNull();
      expect(rowOf(mount, "conv-a")!.getAttribute("aria-current")).toBe("page");
    });

    it("closes on Escape from inside the rail but not from the transcript", async () => {
      const { mount } = await railSetup();
      const escape = () =>
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      bodyOf(mount).dispatchEvent(escape());
      await flush();
      expect(historyRoot(mount)).not.toBeNull();

      historyRoot(mount)!.dispatchEvent(escape());
      await flush();
      expect(historyRoot(mount)).toBeNull();
      expect(document.activeElement).toBe(historyButton(mount));
    });

    it("collapses to panel below 720px while keeping the same view element", async () => {
      const { mount, controller } = await railSetup();
      const view = historyRoot(mount)!;
      const bar = view.querySelector<HTMLElement>(".persona-history-topbar")!;
      setContainerWidth(mount, 500);
      controller.update({});
      await flush();
      expect(historyRoot(mount)).toBe(view);
      expect(mount.querySelector(".persona-history-rail-host")).toBeNull();
      expect(view.getAttribute("data-persona-history-presentation")).toBe("panel");
      expect(bodyOf(mount).style.display).toBe("none");
      // Panel hosting needs the header back as a direct container child.
      expect(headerOf(mount).parentElement).toBe(
        mount.querySelector(".persona-widget-container")
      );
      // The bar moves into the shell header, one instance, no entrance replay.
      expect(headerOf(mount).style.display).not.toBe("none");
      expect(headerOf(mount).hasAttribute("inert")).toBe(false);
      expect(headerHostOf(mount)!.contains(bar)).toBe(true);
      expect(mount.querySelectorAll(".persona-history-topbar")).toHaveLength(1);
      expect(view.classList.contains("persona-history-view--enter")).toBe(false);
      expect(document.activeElement).toBe(
        bar.querySelector('[data-persona-history-focus="close"]')
      );

      // Widening back to rail must hand the header back.
      setContainerWidth(mount, 900);
      controller.update({});
      await flush();
      expect(mount.querySelector(".persona-history-rail-host")).not.toBeNull();
      // And the header travels back into the conversation column.
      expect(
        headerOf(mount).closest(".persona-history-rail-conversation")
      ).not.toBeNull();
      expect(headerOf(mount).style.display).not.toBe("none");
      expect(headerOf(mount).hasAttribute("inert")).toBe(false);
      expect(headerHostOf(mount)).toBeNull();
      expect(suppressedIn(headerOf(mount))).toEqual([]);
      expect(view.contains(bar)).toBe(true);
      expect(mount.querySelectorAll(".persona-history-topbar")).toHaveLength(1);
    });

    it("keeps a rebuilt header inside the conversation column", async () => {
      const { mount, controller } = await railSetup();
      controller.update({ layout: { header: { layout: "minimal" } } });
      await flush();
      const header = headerOf(mount);
      expect(header.closest(".persona-history-rail-conversation")).not.toBeNull();
      expect(mount.querySelectorAll('[data-persona-theme-zone="header"]')).toHaveLength(1);
      expect(mount.querySelector(".persona-history-rail-host")).not.toBeNull();
    });

    it("re-derives the rail width from a live config update", async () => {
      const { mount, controller } = await railSetup();
      const host = mount.querySelector<HTMLElement>(".persona-history-rail-host")!;
      expect(host.style.flex).toBe("0 0 260px");
      controller.update({
        features: { history: { rail: { width: 320 } } },
      } as never);
      await flush();
      expect(host.style.flex).toBe("0 0 320px");
      // A side flip moves the host past the conversation and swaps the divider.
      controller.update({
        features: { history: { rail: { side: "right" } } },
      } as never);
      await flush();
      const shell = mount.querySelector<HTMLElement>(".persona-history-rail-shell")!;
      expect(shell.lastElementChild).toBe(host);
      expect(host.style.borderLeft).not.toBe("");
      expect(host.style.borderRight).toBe("");
    });

    it("ignores Escape raised by the header now that it sits in the column", async () => {
      const { mount } = await railSetup();
      headerOf(mount).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(historyRoot(mount)).not.toBeNull();
    });

    it("anchors a top-right close button to the column, not the container", async () => {
      const { mount } = setup({
        historyFeature: { enabled: true, presentation: "rail" },
        config: {
          launcher: { enabled: false, closeButtonPlacement: "top-right" },
        },
      });
      const container = setContainerWidth(mount, 900);
      await openHistoryUI(mount);
      const column = mount.querySelector<HTMLElement>(
        ".persona-history-rail-conversation"
      )!;
      const wrapper = mount.querySelector<HTMLElement>(
        'button[aria-label="Close chat"]'
      )!.parentElement!;
      // Absolutely positioned: anchored to the container it would float over
      // the rail instead of over the conversation.
      expect(wrapper.classList.contains("persona-absolute")).toBe(true);
      expect(wrapper.parentElement).toBe(column);
      expect(wrapper.parentElement).not.toBe(container);
      expect(column.style.position).toBe("relative");
    });

    it("hands the container back in its original child order", async () => {
      const { mount } = setup({
        historyFeature: { enabled: true, presentation: "rail" },
        config: {
          launcher: { enabled: false, closeButtonPlacement: "top-right" },
        },
      });
      const container = setContainerWidth(mount, 900);
      const before = Array.from(container.children);
      await openHistoryUI(mount);
      const column = mount.querySelector<HTMLElement>(
        ".persona-history-rail-conversation"
      )!;
      expect(column.contains(headerOf(mount))).toBe(true);
      expect(column.contains(bodyOf(mount))).toBe(true);
      // The rail's own full close is the header toggle; its bar collapses.
      historyButton(mount)!.click();
      await flush(20);
      expect(mount.querySelector(".persona-history-rail-shell")).toBeNull();
      const after = Array.from(container.children);
      expect(after).toHaveLength(before.length);
      after.forEach((node, index) => expect(node).toBe(before[index]));
    });

    it("shrinks the host to the icon rail and back from the toggle", async () => {
      const { mount } = await railSetup();
      const host = mount.querySelector<HTMLElement>(".persona-history-rail-host")!;
      const toggle = () =>
        mount.querySelector<HTMLButtonElement>(
          '[data-persona-history-focus="collapse"]'
        )!;
      expect(host.style.flex).toBe("0 0 260px");

      toggle().click();
      await flush();
      expect(host.style.flex).toBe("0 0 52px");
      expect(
        historyRoot(mount)!.classList.contains("persona-history-view--rail-collapsed")
      ).toBe(true);
      // Same button, so focus never leaves the control the visitor pressed.
      expect(toggle().getAttribute("aria-label")).toBe("Expand conversation list");

      toggle().click();
      await flush();
      expect(host.style.flex).toBe("0 0 260px");
      expect(
        historyRoot(mount)!.classList.contains("persona-history-view--rail-collapsed")
      ).toBe(false);
    });

    it("moves focus into the rail only for a keyboard-initiated open", async () => {
      const { mount, controller } = setup({
        historyFeature: { enabled: true, presentation: "rail" },
      });
      setContainerWidth(mount, 900);
      const host = () =>
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!;
      const toggle = () =>
        mount.querySelector<HTMLButtonElement>(
          '[data-persona-history-focus="collapse"]'
        )!;
      const close = async () => {
        historyButton(mount)!.click();
        await flush(20);
      };

      // Pointer: the conversation stays operable beside the rail, so a focus
      // move would only leave a keyboard ring on the toggle.
      await openHistoryUI(mount);
      expect(host().contains(document.activeElement)).toBe(false);
      await close();

      // Programmatic: no user event behind it at all.
      await controller.showHistory();
      await flush();
      expect(host().contains(document.activeElement)).toBe(false);
      await close();

      await openHistoryUI(mount, { keyboard: true });
      expect(document.activeElement).toBe(toggle());
    });

    it("renders no toggle and stays expanded when collapse is turned off", async () => {
      const { mount } = await railSetup({ collapsible: false });
      expect(
        mount.querySelector('[data-persona-history-focus="collapse"]')
      ).toBeNull();
      expect(
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex
      ).toBe("0 0 260px");
    });

    it("starts collapsed when the host configures it", async () => {
      const { mount } = await railSetup({ defaultCollapsed: true });
      expect(
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex
      ).toBe("0 0 52px");
      expect(
        historyRoot(mount)!.classList.contains("persona-history-view--rail-collapsed")
      ).toBe(true);
    });

    it("closes fully on Escape from a collapsed rail", async () => {
      const { mount } = await railSetup();
      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="collapse"]')!
        .click();
      await flush();
      historyRoot(mount)!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush(20);
      expect(historyRoot(mount)).toBeNull();
      expect(mount.querySelector(".persona-history-rail-shell")).toBeNull();
      expect(document.activeElement).toBe(historyButton(mount));
    });

    it("keeps the collapsed state across a close, a reopen, and a width flip", async () => {
      const { mount, controller } = setup({
        historyFeature: { enabled: true, presentation: "rail" },
        config: { persistState: { keyPrefix: "persona-test-" } },
      });
      setContainerWidth(mount, 900);
      await openHistoryUI(mount);
      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="collapse"]')!
        .click();
      await flush();
      expect(window.localStorage.getItem("persona-test-rail-collapsed")).toBe("1");

      historyButton(mount)!.click();
      await flush(20);
      await openHistoryUI(mount);
      expect(
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex
      ).toBe("0 0 52px");

      // Panel always shows the whole list; the rail restores the state.
      setContainerWidth(mount, 500);
      controller.update({});
      await flush();
      expect(
        historyRoot(mount)!.classList.contains("persona-history-view--rail-collapsed")
      ).toBe(false);
      setContainerWidth(mount, 900);
      controller.update({});
      await flush();
      expect(
        historyRoot(mount)!.classList.contains("persona-history-view--rail-collapsed")
      ).toBe(true);
      expect(
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex
      ).toBe("0 0 52px");
    });

    it("falls back to memory when state persistence is off", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const { mount } = await railSetup();
      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="collapse"]')!
        .click();
      await flush();
      expect(
        setItem.mock.calls.filter(([key]) =>
          String(key).endsWith("rail-collapsed")
        )
      ).toEqual([]);
      expect(window.localStorage.getItem("persona-rail-collapsed")).toBeNull();
      // The in-memory value still survives a close and reopen.
      historyButton(mount)!.click();
      await flush(20);
      await openHistoryUI(mount);
      expect(
        mount.querySelector<HTMLElement>(".persona-history-rail-host")!.style.flex
      ).toBe("0 0 52px");
    });

    it("auto keeps a floating launcher on panel at any width", async () => {
      const { mount } = setup({
        historyFeature: { enabled: true, presentation: "auto" },
        config: { launcher: { enabled: true, autoExpand: true } },
      });
      setContainerWidth(mount, 1200);
      await openHistoryUI(mount);
      expect(mount.querySelector(".persona-history-rail-host")).toBeNull();
      expect(historyRoot(mount)!.getAttribute("data-persona-history-presentation")).toBe(
        "panel"
      );
    });
  });

  describe("navigation and transitions", () => {
    it("records the conversation return surface and restores invoker focus", async () => {
      const { mount, controller } = setup();
      const closed: unknown[] = [];
      controller.on("history:closed", (payload) => closed.push(payload));
      await openHistoryUI(mount);
      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="close"]')!
        .click();
      await flush();
      expect(closed).toEqual([
        expect.objectContaining({ returnSurface: "conversation" }),
      ]);
      expect(document.activeElement).toBe(historyButton(mount));
    });

    it("labels the panel back control for the no-Home fallback", async () => {
      const { mount } = setup();
      await openHistoryUI(mount);
      const back = mount.querySelector<HTMLButtonElement>(
        '[data-persona-history-focus="close"]'
      )!;
      expect(back.getAttribute("aria-label")).toBe("Back to conversation");
      expect(document.activeElement).toBe(back);
    });

    it("keeps Messages open and the prior transcript intact when an open fails", async () => {
      const { mount, provider } = setup();
      provider.setFailure("getPage", { code: "unavailable" });
      await openHistoryUI(mount);
      rowOf(mount, "conv-a")!.click();
      await flush(20);
      expect(historyRoot(mount)).not.toBeNull();
      expect(bodyOf(mount).querySelectorAll("[data-message-id]").length).toBe(0);
    });

    it("disables the button with an accessible explanation while a turn streams", async () => {
      const hanging = vi.fn().mockImplementation((_url: string, init: any) => {
        const signal = init.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      });
      const originalFetch = global.fetch;
      global.fetch = hanging as unknown as typeof fetch;
      try {
        const { mount, controller } = setup();
        controller.submitMessage("hello");
        await flush(20);
        const button = historyButton(mount)!;
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(
          "Messages, available once the reply finishes"
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("open flow", () => {
    it("hydrates the transcript and closes the panel only after the commit", async () => {
      const { mount, provider } = setup({ provider: { latencyMs: 5 } });
      historyButton(mount)!.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      await flush(20);
      rowOf(mount, "conv-a")!.click();
      // Still mid-flight: the panel must not close before the activation.
      expect(historyRoot(mount)).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 40));
      await flush(20);
      expect(historyRoot(mount)).toBeNull();
      expect(provider.getActiveConversationId()).toBe("conv-a");
      const ids = Array.from(
        bodyOf(mount).querySelectorAll("[data-message-id]")
      ).map((node) => node.getAttribute("data-message-id"));
      expect(ids).toEqual(["a1", "a2", "a3"]);
    });

  });

  describe("show earlier messages", () => {
    it("appears with a cursor and corrects scroll after the prepend", async () => {
      const long: DemoHistoryConversationSeed = {
        id: "conv-long",
        title: "Long thread",
        targetId: null,
        messages: Array.from({ length: 8 }, (_value, index) => ({
          id: `m${index}`,
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `message ${index}`,
        })),
      };
      const { mount, controller } = setup({
        provider: { conversations: [long], pageSize: 3 },
      });
      await controller.openConversation("conv-long");
      await flush(20);

      const pill = mount.querySelector<HTMLButtonElement>(
        "[data-persona-history-earlier]"
      );
      expect(pill).not.toBeNull();
      expect(pill!.textContent).toBe("Show earlier messages");

      const body = bodyOf(mount);
      let height = 300;
      Object.defineProperty(body, "scrollHeight", {
        configurable: true,
        get: () => height,
      });
      body.scrollTop = 0;
      // The prepend grows the transcript above the reader's position, so the
      // correction must add exactly the height delta back to scrollTop.
      pill!.click();
      height = 500;
      await flush(30);

      expect(body.scrollTop).toBe(200);
      const ids = Array.from(body.querySelectorAll("[data-message-id]")).map((node) =>
        node.getAttribute("data-message-id")
      );
      expect(ids.slice(0, 3)).toEqual(["m2", "m3", "m4"]);
    });

    it("disappears once the transcript start is reached", async () => {
      const { mount, controller } = setup();
      await controller.openConversation("conv-a");
      await flush(20);
      expect(
        mount.querySelector("[data-persona-history-earlier]")
      ).toBeNull();
    });
  });

  /**
   * Close sequencing: exit animation -> unmount and restore chrome -> focus.
   * jsdom has no Web Animations API, so every other test in this file exercises
   * the synchronous fallback; these install a controllable fake.
   */
  describe("exit animation", () => {
    type FakeAnimation = { settle(): void; cancelled: boolean; cancel(): void };

    const installWaapi = () => {
      const animations: FakeAnimation[] = [];
      Element.prototype.animate = function (): Animation {
        let resolve!: () => void;
        let reject!: () => void;
        const finished = new Promise<Animation>((onDone, onFail) => {
          resolve = () => onDone(animation as unknown as Animation);
          reject = () => onFail(new Error("cancelled"));
        });
        finished.catch(() => undefined);
        const animation: FakeAnimation & { finished: Promise<Animation> } = {
          finished,
          cancelled: false,
          cancel: () => {
            animation.cancelled = true;
            reject();
          },
          settle: resolve,
        };
        animations.push(animation);
        return animation as unknown as Animation;
      } as unknown as Element["animate"];
      return {
        animations,
        settleAll: () => animations.forEach((animation) => animation.settle()),
        restore: () => {
          delete (Element.prototype as Partial<Element>).animate;
        },
      };
    };

    const back = (mount: HTMLElement) =>
      mount.querySelector<HTMLButtonElement>(
        '[data-persona-history-focus="close"]'
      )!;

    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("keeps the chrome hidden until the exit finishes, then restores it and focus", async () => {
      const waapi = installWaapi();
      try {
        const { mount } = setup();
        const header = headerOf(mount);
        const body = bodyOf(mount);
        await openHistoryUI(mount);
        const view = historyRoot(mount)!;

        back(mount).click();
        await flush();
        // Still leaving: the surface is mounted and the conversation is hidden.
        expect(historyRoot(mount)).toBe(view);
        expect(headerHostOf(mount)).not.toBeNull();
        expect(visibleHeaderChildren(header)).toEqual([]);
        expect(body.style.display).toBe("none");
        expect(view.style.pointerEvents).toBe("none");
        expect(document.activeElement).not.toBe(historyButton(mount));

        waapi.settleAll();
        await flush();
        expect(historyRoot(mount)).toBeNull();
        expect(headerHostOf(mount)).toBeNull();
        expect(suppressedIn(header)).toEqual([]);
        expect(header.style.display).not.toBe("none");
        expect(header.hasAttribute("inert")).toBe(false);
        expect(body.style.display).not.toBe("none");
        // Chrome first, focus second: the invoker lives in that header.
        expect(document.activeElement).toBe(historyButton(mount));
      } finally {
        waapi.restore();
      }
    });

    it("cancels an unfinished entrance instead of replaying it on the way out", async () => {
      const waapi = installWaapi();
      try {
        const { mount } = setup();
        await openHistoryUI(mount);
        const view = historyRoot(mount)!;
        expect(view.classList.contains("persona-history-view--enter")).toBe(true);

        back(mount).click();
        await flush();
        expect(view.classList.contains("persona-history-view--enter")).toBe(false);
        expect(waapi.animations).toHaveLength(1);

        waapi.settleAll();
        await flush();
        expect(historyRoot(mount)).toBeNull();
      } finally {
        waapi.restore();
      }
    });

    it("closes on the timeout fallback when the exit never settles", async () => {
      const waapi = installWaapi();
      try {
        const { mount } = setup();
        await openHistoryUI(mount);
        back(mount).click();
        await flush();
        expect(historyRoot(mount)).not.toBeNull();

        // The 250ms ceiling is wall-clock, so wait for the effect, not the time.
        await vi.waitFor(() => expect(historyRoot(mount)).toBeNull(), {
          timeout: 3_000,
        });
        await flush();
        expect(bodyOf(mount).style.display).not.toBe("none");
        expect(document.activeElement).toBe(historyButton(mount));
      } finally {
        waapi.restore();
      }
    });

    it("mounts exactly one fresh surface when a reopen preempts the exit", async () => {
      const waapi = installWaapi();
      try {
        const { mount } = setup();
        await openHistoryUI(mount);
        const first = historyRoot(mount)!;

        back(mount).click();
        await flush();
        expect(historyRoot(mount)).toBe(first);

        historyButton(mount)!.click();
        await flush();
        const views = mount.querySelectorAll(".persona-history-view");
        expect(views).toHaveLength(1);
        expect(views[0]).not.toBe(first);
        expect(first.isConnected).toBe(false);

        // The preempted exit settling late must not tear the new surface down.
        waapi.settleAll();
        await flush(20);
        expect(historyRoot(mount)).toBe(views[0]);
        expect(bodyOf(mount).style.display).toBe("none");
        expect(mount.querySelectorAll(".persona-history-rail-shell")).toHaveLength(0);
      } finally {
        waapi.restore();
      }
    });

    it("survives toggle spam with one close per open and no double restore", async () => {
      const waapi = installWaapi();
      try {
        const { mount, controller } = setup();
        const closed: unknown[] = [];
        controller.on("history:closed", (payload) => closed.push(payload));
        const body = bodyOf(mount);
        await openHistoryUI(mount);

        const button = historyButton(mount)!;
        back(mount).click();
        back(mount).click();
        controller.hideHistory();
        button.click();
        button.click();
        await flush(20);

        expect(mount.querySelectorAll(".persona-history-view")).toHaveLength(1);
        expect(closed).toHaveLength(1);
        expect(body.style.display).toBe("none");

        waapi.settleAll();
        await flush(20);
        // The surviving surface is the reopened one, still open.
        expect(historyRoot(mount)).not.toBeNull();
        expect(closed).toHaveLength(1);

        back(mount).click();
        waapi.settleAll();
        await flush(20);
        expect(historyRoot(mount)).toBeNull();
        expect(closed).toHaveLength(2);
        expect(body.style.display).not.toBe("none");
        expect(body.hasAttribute("inert")).toBe(false);
      } finally {
        waapi.restore();
      }
    });

    it("tears a leaving surface down when the widget is destroyed mid-exit", async () => {
      const waapi = installWaapi();
      try {
        const { mount, controller } = setup();
        await openHistoryUI(mount);
        back(mount).click();
        await flush();
        expect(historyRoot(mount)).not.toBeNull();

        controller.destroy();
        expect(mount.querySelectorAll(".persona-history-view")).toHaveLength(0);
        waapi.settleAll();
        await flush();
        expect(mount.querySelectorAll(".persona-history-view")).toHaveLength(0);
      } finally {
        waapi.restore();
      }
    });
  });

  describe("destructive confirmations", () => {
    const openRowMenu = async (mount: HTMLElement, id: string) => {
      mount
        .querySelector<HTMLButtonElement>(
          `[data-persona-history-focus="menu:${id}"]`
        )!
        .click();
      await flush();
    };

    it("confirms a delete with a focus-trapped alert dialog", async () => {
      const { mount, provider } = setup();
      await openHistoryUI(mount);
      await openRowMenu(mount, "conv-a");
      mount
        .querySelector<HTMLButtonElement>(
          '[data-persona-history-focus="menu-item:conv-a"]'
        )!
        .click();
      await flush();

      const dialog = dialogOf();
      expect(dialog).not.toBeNull();
      expect(dialog!.getAttribute("aria-modal")).toBe("true");
      expect(dialog!.hasAttribute("aria-labelledby")).toBe(true);
      expect(dialog!.hasAttribute("aria-describedby")).toBe(true);
      // Least destructive action holds focus first.
      expect(document.activeElement).toBe(
        dialog!.querySelector(".persona-history-confirm__cancel")
      );

      dialog!
        .querySelector<HTMLButtonElement>(".persona-history-confirm__confirm")!
        .click();
      await flush(20);
      expect(dialogOf()).toBeNull();
      expect(provider.getConversationIds()).not.toContain("conv-a");
      expect(rowOf(mount, "conv-a")).toBeNull();
    });

    it("cancels on Escape and restores focus without deleting", async () => {
      const { mount, provider } = setup();
      await openHistoryUI(mount);
      await openRowMenu(mount, "conv-b");
      const trigger = mount.querySelector<HTMLElement>(
        '[data-persona-history-focus="menu-item:conv-b"]'
      )!;
      trigger.focus();
      trigger.click();
      await flush();

      const dialog = dialogOf()!;
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush(20);
      expect(dialogOf()).toBeNull();
      expect(provider.getConversationIds()).toContain("conv-b");
      expect(rowOf(mount, "conv-b")).not.toBeNull();
    });

    it("uses browser-scope copy for delete all", async () => {
      const { mount } = setup();
      await openHistoryUI(mount);
      mount
        .querySelector<HTMLButtonElement>('[data-persona-history-focus="clear"]')!
        .click();
      await flush();
      const dialog = dialogOf()!;
      expect(
        dialog.querySelector(".persona-history-confirm__description")!.textContent
      ).toContain("on this browser");
      dialog
        .querySelector<HTMLButtonElement>(".persona-history-confirm__cancel")!
        .click();
      await flush();
    });

    it("hides forget-this-device when the provider cannot reset", async () => {
      const { mount } = setup();
      await openHistoryUI(mount);
      expect(
        mount.querySelector('[data-persona-history-focus="reset"]')
      ).toBeNull();
    });
  });
});
