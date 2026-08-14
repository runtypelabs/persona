// @vitest-environment jsdom

/**
 * The history rail beside a resizable artifact split: the rail/panel width
 * fallback measures the whole split, not the chat column the artifact pane
 * borrows from, and an artifact drag reserves room for a docked rail plus a
 * readable transcript.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
} from "./internal/demo-history-provider";
import { ARTIFACT_RESIZE_RAILED_TRANSCRIPT_MIN_PX } from "./utils/artifact-resize";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [{ id: "a1", role: "user", content: "where is my order" }],
  },
];

const RAIL_WIDTH = 260;
const SPLIT_WIDTH = 1200;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

/** jsdom measures nothing; every width in these tests is stated outright. */
const setWidth = (element: HTMLElement, width: number): void => {
  element.getBoundingClientRect = () =>
    ({
      width,
      height: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => width,
  });
};

const setup = (options: { containerWidth?: number } = {}) => {
  setHistoryProviderFactory(() => createDemoHistoryProvider({ conversations: SEEDS }));
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: { keyPrefix: "persona-artifact-rail-test-" },
    suggestionChips: [],
    features: {
      history: { enabled: true, presentation: "rail" },
      artifacts: {
        enabled: true,
        allowedTypes: ["markdown"],
        layout: { resizable: true },
      },
    },
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
  setWidth(container, options.containerWidth ?? SPLIT_WIDTH);
  setWidth(splitRoot(mount), SPLIT_WIDTH);
  controller.update({});
  return { mount, controller };
};

const splitRoot = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-artifact-split-root")!;
const paneEl = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-artifact-pane")!;
const artifactHandle = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-artifact-split-handle")!;
const railHostOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-rail-host");
const historyButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]")!;
const presentationOf = (mount: HTMLElement) =>
  mount
    .querySelector<HTMLElement>("[data-persona-history-presentation]")
    ?.getAttribute("data-persona-history-presentation") ?? null;

const openHistory = async (mount: HTMLElement) => {
  historyButton(mount).dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
  );
  await flush();
};

const addArtifact = (controller: ReturnType<typeof createAgentExperience>) => {
  controller.upsertArtifact({
    id: "art-1",
    title: "Draft",
    artifactType: "markdown",
    content: "# Draft",
  });
};

/** Drags the artifact divider by `dx` px (negative widens the pane). */
const dragArtifact = (mount: HTMLElement, dx: number) => {
  const handle = artifactHandle(mount);
  handle.dispatchEvent(
    new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 0,
    })
  );
  document.dispatchEvent(new MouseEvent("pointermove", { clientX: dx }));
  document.dispatchEvent(new MouseEvent("pointerup", { clientX: dx }));
  return Number.parseFloat(paneEl(mount).style.width);
};

describe("history rail beside a resizable artifact split", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
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

  it("resolves the presentation from the split root, not the borrowed chat width", async () => {
    // The artifact pane has taken most of the row: the chat column is far under
    // the rail's own minimum, the split root is not.
    const { mount } = setup({ containerWidth: 400 });
    await openHistory(mount);
    expect(presentationOf(mount)).toBe("rail");
    expect(railHostOf(mount)).not.toBeNull();
  });

  it("still flips to panel when the split root itself is narrow", async () => {
    const { mount } = setup({ containerWidth: 400 });
    await openHistory(mount);
    expect(presentationOf(mount)).toBe("rail");

    // A real host/window narrowing shrinks the split root too.
    setWidth(splitRoot(mount), 600);
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(presentationOf(mount)).toBe("panel");
    expect(railHostOf(mount)).toBeNull();
  });

  it("reserves the docked rail plus a readable transcript while dragging", async () => {
    const { mount, controller } = setup();
    await openHistory(mount);
    const railHost = railHostOf(mount)!;
    setWidth(railHost, RAIL_WIDTH);
    addArtifact(controller);

    const width = dragArtifact(mount, -2000);
    const reserved = RAIL_WIDTH + ARTIFACT_RESIZE_RAILED_TRANSCRIPT_MIN_PX;
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(SPLIT_WIDTH - reserved);
    // Everything the reserve does not claim is still draggable (gap 0, handle <= 6).
    expect(width).toBeGreaterThanOrEqual(SPLIT_WIDTH - reserved - 6);
  });

  it("keeps the flat chat minimum when no rail is docked", async () => {
    const { mount, controller } = setup();
    addArtifact(controller);

    const width = dragArtifact(mount, -2000);
    const reserved = RAIL_WIDTH + ARTIFACT_RESIZE_RAILED_TRANSCRIPT_MIN_PX;
    expect(width).toBeGreaterThan(SPLIT_WIDTH - reserved);
    expect(width).toBeLessThanOrEqual(SPLIT_WIDTH - 200);
  });

  it("keeps the rail docked after a drag that widened the pane", async () => {
    const { mount, controller } = setup();
    await openHistory(mount);
    setWidth(railHostOf(mount)!, RAIL_WIDTH);
    addArtifact(controller);
    const width = dragArtifact(mount, -2000);

    // The chat column now measures what the pane left it; the rail must survive.
    setWidth(mount.querySelector<HTMLElement>(".persona-widget-container")!, SPLIT_WIDTH - width);
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(presentationOf(mount)).toBe("rail");
    expect(railHostOf(mount)).not.toBeNull();
  });
});
