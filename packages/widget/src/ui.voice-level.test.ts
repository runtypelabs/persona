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

/** Drives rAF by hand so a frame is a test step, not a timer race. */
type FrameCallback = (time: number) => void;

const createFrameClock = () => {
  let next = 1;
  const pending = new Map<number, FrameCallback>();
  const live = new Set<number>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCallback) => {
    const id = next++;
    pending.set(id, cb);
    live.add(id);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
    live.delete(id);
  });
  return {
    /** Run one frame. Callbacks that re-request are queued for the next. */
    tick(times = 1) {
      for (let i = 0; i < times; i += 1) {
        const due = Array.from(pending.entries());
        pending.clear();
        for (const [id, cb] of due) {
          live.delete(id);
          cb(performance.now());
        }
      }
    },
    /** Frames requested but never cancelled or run. */
    get outstanding() {
      return pending.size;
    },
  };
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
    voiceRecognition: { enabled: true },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const micWrapper = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-mic]")!.parentElement!;

const footerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-footer")!;

const levelOn = (el: HTMLElement) =>
  el.style.getPropertyValue("--persona-voice-level");

describe("live voice level variable", () => {
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

  it("publishes nothing until recording starts", () => {
    const clock = createFrameClock();
    const { mount } = makeController();
    clock.tick();
    expect(levelOn(micWrapper(mount))).toBe("");
    expect(levelOn(footerOf(mount))).toBe("");
  });

  it("writes the fallback midpoint on a provider with no audio graph", () => {
    const clock = createFrameClock();
    const { mount, controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick();
    // The Web Speech path exposes no stream, so the level is a steady midpoint
    // rather than a fabricated waveform.
    expect(levelOn(micWrapper(mount))).toBe("0.5");
    expect(levelOn(footerOf(mount))).toBe("0.5");
  });

  it("writes once and skips unchanged frames", () => {
    const clock = createFrameClock();
    const { mount, controller } = makeController();
    const footer = footerOf(mount);
    const setProperty = vi.spyOn(footer.style, "setProperty");
    controller.startVoiceRecognition();

    clock.tick(10);
    const levelWrites = setProperty.mock.calls.filter(
      ([name]) => name === "--persona-voice-level"
    );
    // Ten frames at a steady level is one style write, not ten: the value is
    // quantized to 0.01 and an unchanged value is skipped.
    expect(levelWrites).toHaveLength(1);
    expect(levelWrites[0][1]).toBe("0.5");
  });

  it("quantizes to two decimals", () => {
    const clock = createFrameClock();
    const { mount, controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick(3);
    const written = levelOn(micWrapper(mount));
    expect(written).not.toBe("");
    // No long floating-point tails may reach the style attribute.
    expect(written).toMatch(/^\d(\.\d{1,2})?$/);
    expect(Number(written)).toBeGreaterThanOrEqual(0);
    expect(Number(written)).toBeLessThanOrEqual(1);
  });

  it("keeps publishing under reduced motion", () => {
    // The variable is data, not motion: only the default visual that consumes
    // it is gated, so a theme's own waveform still works.
    const clock = createFrameClock();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
    const { mount, controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick(2);
    expect(levelOn(micWrapper(mount))).toBe("0.5");
  });

  it("clears the property and the frame loop when recording ends", () => {
    const clock = createFrameClock();
    const { mount, controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick();
    expect(levelOn(micWrapper(mount))).toBe("0.5");

    controller.stopVoiceRecognition();
    expect(levelOn(micWrapper(mount))).toBe("");
    expect(levelOn(footerOf(mount))).toBe("");
    clock.tick();
    expect(clock.outstanding).toBe(0);
  });

  it("leaves no frame outstanding after destroy", () => {
    const clock = createFrameClock();
    const { controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick(3);
    expect(clock.outstanding).toBeGreaterThan(0);

    controller.destroy();
    controllers.length = 0;
    expect(clock.outstanding).toBe(0);
  });

  it("leaves no frame outstanding after a composer rebuild", () => {
    const clock = createFrameClock();
    const { controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick(2);
    const before = clock.outstanding;
    expect(before).toBeGreaterThan(0);

    // A live contextMentions edit rebuilds the composer surface end to end.
    controller.update({ contextMentions: { enabled: false } } as never);
    // The outgoing footer's loop is cancelled; the rebuilt mic re-arms exactly
    // one, so the count never grows across rebuilds.
    expect(clock.outstanding).toBeLessThanOrEqual(before);
  });

  it("re-arms against the rebuilt footer when recording survives a rebuild", () => {
    const clock = createFrameClock();
    const { mount, controller } = makeController();
    controller.startVoiceRecognition();
    clock.tick();
    expect(levelOn(footerOf(mount))).toBe("0.5");

    controller.update({ contextMentions: { enabled: false } } as never);
    clock.tick();
    // The new footer is a different element and must carry the property too.
    expect(levelOn(footerOf(mount))).toBe("0.5");
  });
});
