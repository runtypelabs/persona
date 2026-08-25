// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const SEGMENTED_MODES = {
  modes: [
    { id: "chat", label: "Chat", groupId: "surface", iconName: "message-circle" },
    { id: "cowork", label: "Cowork", groupId: "surface" },
  ],
  modeGroups: [
    {
      id: "surface",
      selection: "single" as const,
      presentation: "segmented" as const,
      label: "Surface",
    },
  ],
  defaultActiveModeIds: ["chat"],
};

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const trackOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-composer-segmented");

const segmentOf = (mount: HTMLElement, modeId: string) =>
  mount.querySelector<HTMLButtonElement>(
    `.persona-composer-segmented-item[data-persona-composer-mode="${modeId}"]`
  )!;

const chipIds = (mount: HTMLElement) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>(
      ".persona-composer-mode-chip[data-persona-composer-mode]"
    )
  ).map((chip) => chip.getAttribute("data-persona-composer-mode"));

describe("segmented mode groups", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
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
    vi.restoreAllMocks();
  });

  it("renders loose buttons for the default presentation", async () => {
    const { mount } = makeController({
      composer: {
        modes: [
          { id: "chat", label: "Chat", groupId: "surface" },
          { id: "cowork", label: "Cowork", groupId: "surface" },
        ],
        modeGroups: [{ id: "surface", selection: "single" }],
      },
    });
    await flush();
    expect(trackOf(mount)).toBeNull();
    expect(
      mount.querySelector('[data-persona-composer-action="core:mode:chat"]')
    ).not.toBeNull();
  });

  it("renders one labelled track with a segment per mode", async () => {
    const { mount } = makeController({ composer: SEGMENTED_MODES });
    await flush();
    const track = trackOf(mount)!;
    expect(track).not.toBeNull();
    expect(track.getAttribute("role")).toBe("group");
    expect(track.getAttribute("aria-label")).toBe("Surface");
    expect(track.querySelectorAll(".persona-composer-segmented-item")).toHaveLength(2);
    // The members contribute no loose buttons of their own.
    expect(
      mount.querySelector('[data-persona-composer-action="core:mode:chat"]')
    ).toBeNull();
  });

  it("marks the active segment with aria-pressed", async () => {
    const { mount } = makeController({ composer: SEGMENTED_MODES });
    await flush();
    expect(segmentOf(mount, "chat").getAttribute("aria-pressed")).toBe("true");
    expect(segmentOf(mount, "cowork").getAttribute("aria-pressed")).toBe("false");

    segmentOf(mount, "cowork").click();
    await flush();
    expect(segmentOf(mount, "chat").getAttribute("aria-pressed")).toBe("false");
    expect(segmentOf(mount, "cowork").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps one segment on in a single-selection track", async () => {
    const { mount, controller } = makeController({ composer: SEGMENTED_MODES });
    await flush();
    segmentOf(mount, "chat").click();
    await flush();
    expect(segmentOf(mount, "chat").getAttribute("aria-pressed")).toBe("true");
    expect(controller.getComposerState().activeModeIds).toEqual(["chat"]);
  });

  it("toggles freely in a multiple-selection track", async () => {
    const { mount, controller } = makeController({
      composer: {
        ...SEGMENTED_MODES,
        modeGroups: [
          {
            id: "surface",
            selection: "multiple",
            presentation: "segmented",
            label: "Surface",
          },
        ],
      },
    });
    await flush();
    segmentOf(mount, "chat").click();
    await flush();
    expect(segmentOf(mount, "chat").getAttribute("aria-pressed")).toBe("false");
    expect(controller.getComposerState().activeModeIds).toEqual([]);
  });

  it("renders no chip for a segmented group's modes", async () => {
    const { mount } = makeController({ composer: SEGMENTED_MODES });
    await flush();
    expect(chipIds(mount)).toEqual([]);
  });

  it("still chips modes outside the segmented group", async () => {
    const { mount } = makeController({
      composer: {
        ...SEGMENTED_MODES,
        modes: [...SEGMENTED_MODES.modes, { id: "search", label: "Search" }],
        defaultActiveModeIds: ["chat", "search"],
      },
    });
    await flush();
    expect(chipIds(mount)).toEqual(["search"]);
  });

  it("stays out of the compact expansion decision", async () => {
    const { mount } = makeController({ composer: SEGMENTED_MODES });
    await flush();
    // A default-active segmented mode is not a chip, so the composer is idle.
    expect(
      mount
        .querySelector(".persona-widget-footer")!
        .hasAttribute("data-persona-composer-compact")
    ).toBe(true);
  });

  it("swaps presentation on a live update()", async () => {
    const { mount, controller } = makeController({
      composer: {
        modes: SEGMENTED_MODES.modes,
        modeGroups: [{ id: "surface", selection: "single" }],
        defaultActiveModeIds: ["chat"],
      },
    });
    await flush();
    expect(trackOf(mount)).toBeNull();

    controller.update({ composer: SEGMENTED_MODES } as never);
    await flush();
    expect(trackOf(mount)).not.toBeNull();
    expect(chipIds(mount)).toEqual([]);

    controller.update({
      composer: {
        modes: SEGMENTED_MODES.modes,
        modeGroups: [{ id: "surface", selection: "single" }],
        defaultActiveModeIds: ["chat"],
      },
    } as never);
    await flush();
    expect(trackOf(mount)).toBeNull();
  });
});
