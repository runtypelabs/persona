// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { ComposerMode, ComposerModeGroup } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

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

const modeButton = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-persona-composer-action="core:mode:${id}"] button`
  )!;

const chips = (mount: HTMLElement) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>(
      "[data-persona-composer-chip-row] [data-persona-composer-mode]"
    )
  );

const chipRow = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-chip-row]");

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const submit = (mount: HTMLElement) =>
  mount
    .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

const modes: ComposerMode[] = [
  {
    id: "search",
    groupId: "tool",
    label: "Search",
    shortLabel: "Search",
    placeholder: "Search the web...",
  },
  { id: "code", groupId: "tool", label: "Code" },
  { id: "concise", groupId: "style", label: "Concise" },
  { id: "verbose", groupId: "style", label: "Verbose" },
  { id: "draft", label: "Draft", persistence: "once" },
];

const modeGroups: ComposerModeGroup[] = [
  { id: "tool", selection: "single" },
  { id: "style", selection: "multiple" },
];

const capturingFetch = (sent: Record<string, unknown>[]) =>
  async (_url: string, _init: unknown, payload: unknown) => {
    sent.push(payload as Record<string, unknown>);
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    } as unknown as Response;
  };

describe("composer modes", () => {
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

  it("renders one toggle per mode in the start cluster, in config order", () => {
    const { mount } = makeController({ composer: { modes, modeGroups } });
    const ids = Array.from(
      mount.querySelectorAll<HTMLElement>(
        "[data-persona-composer-actions-start] [data-persona-composer-action]"
      )
    ).map((el) => el.getAttribute("data-persona-composer-action"));
    expect(ids).toEqual([
      "core:mode:search",
      "core:mode:code",
      "core:mode:concise",
      "core:mode:verbose",
      "core:mode:draft",
    ]);
  });

  it("seeds composer.defaultActiveModeIds into state, chips, and pressed toggles", () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups, defaultActiveModeIds: ["search", "concise"] },
    });
    expect(controller.getComposerState().activeModeIds).toEqual([
      "search",
      "concise",
    ]);
    expect(modeButton(mount, "search").getAttribute("aria-pressed")).toBe("true");
    expect(chips(mount).map((chip) => chip.getAttribute("data-persona-composer-mode")))
      .toEqual(["search", "concise"]);
  });

  it("drops default active ids that name no configured mode", () => {
    const { controller } = makeController({
      composer: { modes, modeGroups, defaultActiveModeIds: ["search", "ghost"] },
    });
    expect(controller.getComposerState().activeModeIds).toEqual(["search"]);
  });

  it("lets a default mode be toggled back off", async () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups, defaultActiveModeIds: ["search"] },
    });
    modeButton(mount, "search").click();
    await flush();
    expect(controller.getComposerState().activeModeIds).toEqual([]);
  });

  it("reflects selection with aria-pressed and composer state", async () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups },
    });
    expect(modeButton(mount, "search").getAttribute("aria-pressed")).toBe("false");
    modeButton(mount, "search").click();
    await flush();
    expect(modeButton(mount, "search").getAttribute("aria-pressed")).toBe("true");
    expect(controller.getComposerState().activeModeIds).toEqual(["search"]);
  });

  it("a single-selection group deselects siblings", async () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups },
    });
    modeButton(mount, "search").click();
    modeButton(mount, "code").click();
    await flush();
    expect(controller.getComposerState().activeModeIds).toEqual(["code"]);
    expect(modeButton(mount, "search").getAttribute("aria-pressed")).toBe("false");
  });

  it("a multiple-selection group stacks", async () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups },
    });
    modeButton(mount, "concise").click();
    modeButton(mount, "verbose").click();
    await flush();
    expect(controller.getComposerState().activeModeIds).toEqual([
      "concise",
      "verbose",
    ]);
  });

  it("renders a removable chip per active mode in the header", async () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups },
    });
    expect(chips(mount)).toHaveLength(0);
    expect(chipRow(mount)!.style.display).toBe("none");
    modeButton(mount, "search").click();
    await flush();
    const chip = chips(mount)[0];
    expect(chip.textContent).toContain("Search");
    // The shared header chip row, not a container of its own.
    expect(chip.parentElement).toBe(chipRow(mount));
    expect(
      chip.closest("[data-persona-composer-header]")
    ).not.toBeNull();

    chip.querySelector<HTMLButtonElement>(".persona-mention-chip-remove")!.click();
    await flush();
    expect(chips(mount)).toHaveLength(0);
    expect(chipRow(mount)!.style.display).toBe("none");
    expect(controller.getComposerState().activeModeIds).toEqual([]);
  });

  it("gives each chip remove control an accessible name", async () => {
    const { mount } = makeController({ composer: { modes, modeGroups } });
    modeButton(mount, "search").click();
    await flush();
    expect(
      chips(mount)[0]
        .querySelector(".persona-mention-chip-remove")!
        .getAttribute("aria-label")
    ).toBe("Remove Search");
  });

  it("an active mode's placeholder wins, and clearing it restores the config copy", async () => {
    const { mount } = makeController({
      copy: { inputPlaceholder: "Ask anything" },
      composer: { modes, modeGroups },
    });
    const textarea = textareaOf(mount);
    expect(textarea.placeholder).toBe("Ask anything");
    modeButton(mount, "search").click();
    await flush();
    expect(textarea.placeholder).toBe("Search the web...");
    modeButton(mount, "search").click();
    await flush();
    expect(textarea.placeholder).toBe("Ask anything");
  });

  it("config order decides which active placeholder wins", async () => {
    const ordered: ComposerMode[] = [
      { id: "first", label: "First", placeholder: "From first" },
      { id: "second", label: "Second", placeholder: "From second" },
    ];
    const { mount } = makeController({ composer: { modes: ordered } });
    modeButton(mount, "second").click();
    await flush();
    expect(textareaOf(mount).placeholder).toBe("From second");
    modeButton(mount, "first").click();
    await flush();
    expect(textareaOf(mount).placeholder).toBe("From first");
  });

  it("re-resolves the placeholder after a live config update", async () => {
    const { mount, controller } = makeController({
      copy: { inputPlaceholder: "Ask anything" },
      composer: { modes, modeGroups },
    });
    modeButton(mount, "search").click();
    await flush();
    controller.update({
      composer: {
        modes: [{ ...modes[0], placeholder: "Updated placeholder" }],
        modeGroups,
      },
    } as never);
    expect(textareaOf(mount).placeholder).toBe("Updated placeholder");
  });

  it("drops selections whose mode was removed by update()", async () => {
    const { mount, controller } = makeController({
      composer: { modes, modeGroups },
    });
    modeButton(mount, "search").click();
    await flush();
    controller.update({
      composer: { modes: [modes[2]], modeGroups },
    } as never);
    await flush();
    expect(controller.getComposerState().activeModeIds).toEqual([]);
    expect(chips(mount)).toHaveLength(0);
  });

  it("ships active modes in composerOptions and clears once modes after send", async () => {
    const sent: Record<string, unknown>[] = [];
    const { mount, controller } = makeController({
      composer: { modes, modeGroups },
      customFetch: capturingFetch(sent),
    });
    modeButton(mount, "search").click();
    modeButton(mount, "draft").click();
    await flush();
    expect(controller.getComposerState().activeModeIds).toEqual(["search", "draft"]);

    const textarea = textareaOf(mount);
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    submit(mount);
    await flush(12);

    expect(sent[0]?.composerOptions).toEqual({
      activeModeIds: ["search", "draft"],
    });
    // `once` cleared, `sticky` survived.
    expect(controller.getComposerState().activeModeIds).toEqual(["search"]);
    expect(chips(mount).map((chip) => chip.getAttribute("data-persona-composer-mode"))).toEqual([
      "search",
    ]);
  });

  it("puts a mode with presentation overflow in the menu", () => {
    const { mount } = makeController({
      composer: {
        modes: [{ id: "hidden", label: "Hidden", presentation: "overflow" }],
        actionOverflow: { enabled: true },
      },
    });
    // The mode is not in the bar; the trigger stands in for it.
    expect(mount.querySelector('[data-persona-composer-action="core:mode:hidden"]'))
      .toBeNull();
    const trigger = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-overflow-trigger]"
    )!;
    expect(trigger).toBeTruthy();
    // The panel is detached until the menu opens.
    expect(document.querySelector("[data-persona-composer-overflow-menu]")).toBeNull();
    trigger.click();
    const panel = document.querySelector("[data-persona-composer-overflow-menu]")!;
    expect(panel.querySelector('[role="menuitem"]')?.textContent).toContain("Hidden");
  });
});
