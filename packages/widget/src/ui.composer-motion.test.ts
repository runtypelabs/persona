// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start(): void {}
  stop(): void {}
}

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

const micOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!;

const chips = (mount: HTMLElement) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>(
      "[data-persona-composer-chip-row] [data-persona-composer-mode]"
    )
  );

const modeButton = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-persona-composer-action="core:mode:${id}"] button`
  )!;

describe("composer motion state hooks", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
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

  it("stamps the mic idle on the builder-created control", () => {
    const { mount } = makeController({ voiceRecognition: { enabled: true } });
    expect(micOf(mount).getAttribute("data-state")).toBe("idle");
  });

  it("stamps the mic idle on the runtime-created control", () => {
    // No mic at mount; controller.update() creates one through the other path.
    const { mount, controller } = makeController({
      voiceRecognition: { enabled: false },
    });
    expect(mount.querySelector("[data-persona-composer-mic]")).toBeNull();
    controller.update({ voiceRecognition: { enabled: true } } as never);
    expect(micOf(mount).getAttribute("data-state")).toBe("idle");
  });

  it("moves the mic between idle and recording on the browser path", () => {
    const { mount, controller } = makeController({
      voiceRecognition: { enabled: true },
    });
    const mic = micOf(mount);
    controller.startVoiceRecognition();
    expect(mic.getAttribute("data-state")).toBe("recording");
    controller.stopVoiceRecognition();
    expect(mic.getAttribute("data-state")).toBe("idle");
  });

  it("keeps the state attribute across controller.update()", () => {
    const { mount, controller } = makeController({
      voiceRecognition: { enabled: true },
    });
    const mic = micOf(mount);
    controller.startVoiceRecognition();
    expect(mic.getAttribute("data-state")).toBe("recording");
    controller.update({ attachments: { enabled: true } } as never);
    expect(micOf(mount).getAttribute("data-state")).toBe("recording");
  });

  it("marks a newly added mode chip for its entrance", async () => {
    const { mount } = makeController({
      composer: { modes: [{ id: "search", label: "Search" }] },
    });
    modeButton(mount, "search").click();
    await flush();
    expect(chips(mount)[0].hasAttribute("data-persona-chip-enter")).toBe(true);
  });

  it("does not replay the entrance for a chip that survives a rebuild", async () => {
    const { mount, controller } = makeController({
      composer: { modes: [{ id: "search", label: "Search" }] },
    });
    modeButton(mount, "search").click();
    await flush();
    expect(chips(mount)).toHaveLength(1);

    // A live contextMentions edit rebuilds the composer surface end to end.
    controller.update({ contextMentions: { enabled: false } } as never);
    await flush();
    const rebuilt = chips(mount);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].hasAttribute("data-persona-chip-enter")).toBe(false);
  });

  it("does not re-animate an existing chip when a second mode is added", async () => {
    const { mount } = makeController({
      composer: {
        modes: [
          { id: "search", label: "Search" },
          { id: "code", label: "Code" },
        ],
      },
    });
    modeButton(mount, "search").click();
    await flush();
    const first = chips(mount)[0];
    // Clear the one-shot marker the way animationend would.
    first.removeAttribute("data-persona-chip-enter");

    modeButton(mount, "code").click();
    await flush();
    const after = chips(mount);
    expect(after).toHaveLength(2);
    // Same node, still unmarked: the render diffed rather than repainted.
    expect(after[0]).toBe(first);
    expect(after[0].hasAttribute("data-persona-chip-enter")).toBe(false);
    expect(after[1].hasAttribute("data-persona-chip-enter")).toBe(true);
  });

  it("removes a chip immediately when no exit animation will run", async () => {
    // jsdom reports no animation name, which stands in for reduced motion: the
    // node must not wait for an animationend that never arrives.
    const { mount, controller } = makeController({
      composer: { modes: [{ id: "search", label: "Search" }] },
    });
    modeButton(mount, "search").click();
    await flush();
    expect(chips(mount)).toHaveLength(1);

    modeButton(mount, "search").click();
    await flush();
    expect(chips(mount)).toHaveLength(0);
    expect(controller.getComposerState().activeModeIds).toEqual([]);
  });
});
