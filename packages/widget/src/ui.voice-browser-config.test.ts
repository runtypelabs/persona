// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const instances: FakeSpeechRecognition[] = [];

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: unknown = null;
  onerror: unknown = null;
  onend: unknown = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    instances.push(this);
  }
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

const clickMic = (mount: HTMLElement) => {
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-mic]")!.click();
};

describe("browser voice recognition config", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    instances.length = 0;
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
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

  it("honors provider.browser.language", () => {
    const { mount } = makeController({
      voiceRecognition: {
        enabled: true,
        provider: { type: "browser", browser: { language: "fr-FR" } },
      },
    });

    clickMic(mount);

    expect(instances).toHaveLength(1);
    expect(instances[0].lang).toBe("fr-FR");
  });

  it("honors provider.browser.continuous", () => {
    const { mount } = makeController({
      voiceRecognition: {
        enabled: true,
        provider: { type: "browser", browser: { continuous: false } },
      },
    });

    clickMic(mount);

    expect(instances[0].continuous).toBe(false);
  });

  it("falls back to en-US and continuous recognition when unconfigured", () => {
    const { mount } = makeController({ voiceRecognition: { enabled: true } });

    clickMic(mount);

    expect(instances[0].lang).toBe("en-US");
    expect(instances[0].continuous).toBe(true);
  });
});
