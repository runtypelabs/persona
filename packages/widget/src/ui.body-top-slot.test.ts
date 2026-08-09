// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

describe("layout.slots['body-top']", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("resolves defaultContent() to the intro card (regression: queried stale utility classes)", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    let resolved: HTMLElement | null | undefined;

    createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      layout: {
        slots: {
          "body-top": ({ defaultContent }) => {
            resolved = defaultContent();
            return null;
          },
        },
      },
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.hasAttribute("data-persona-intro-card")).toBe(true);
  });

  it("replaces the intro card with the slot element instead of prepending beside it", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();

    createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      layout: {
        slots: {
          "body-top": () => {
            const custom = document.createElement("div");
            custom.setAttribute("data-test-slot", "body-top");
            return custom;
          },
        },
      },
    });

    const body = mount.querySelector("#persona-scroll-container")!;
    expect(body.querySelector("[data-test-slot='body-top']")).not.toBeNull();
    expect(body.querySelector("[data-persona-intro-card]")).toBeNull();
    expect(
      (body.firstElementChild as HTMLElement).getAttribute("data-test-slot")
    ).toBe("body-top");
  });

  it("supports composing around the default intro card", () => {
    window.scrollTo = vi.fn();
    const mount = createMount();

    createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      layout: {
        slots: {
          "body-top": ({ defaultContent }) => {
            const wrapper = document.createElement("div");
            wrapper.setAttribute("data-test-slot", "wrapper");
            const banner = document.createElement("p");
            banner.textContent = "Welcome back";
            wrapper.appendChild(banner);
            const card = defaultContent();
            if (card) wrapper.appendChild(card);
            return wrapper;
          },
        },
      },
    });

    const body = mount.querySelector("#persona-scroll-container")!;
    const wrapper = body.querySelector("[data-test-slot='wrapper']");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector("[data-persona-intro-card]")).not.toBeNull();
  });
});

describe("deprecated layout slots", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const mountWithSlots = (
    slots: Record<string, () => HTMLElement | null>,
    debug = true
  ) => {
    window.scrollTo = vi.fn();
    const mount = createMount();
    createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      debug,
      layout: { slots },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    return mount;
  };

  it("never renders the inert composer/messages slots", () => {
    const composerSlot = vi.fn(() => {
      const el = document.createElement("div");
      el.setAttribute("data-test-composer-slot", "");
      return el;
    });
    const messagesSlot = vi.fn(() => {
      const el = document.createElement("div");
      el.setAttribute("data-test-messages-slot", "");
      return el;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const mount = mountWithSlots({ composer: composerSlot, messages: messagesSlot });

    expect(mount.querySelector("[data-test-composer-slot]")).toBeNull();
    expect(mount.querySelector("[data-test-messages-slot]")).toBeNull();
  });

  it("warns once in debug mode, naming every inert slot configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mountWithSlots({ composer: () => null, messages: () => null });

    const messages = warn.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes("layout.slots."));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("layout.slots.messages");
    expect(messages[0]).toContain("layout.slots.composer");
  });

  it("stays quiet outside debug mode and for supported slots", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mountWithSlots({ composer: () => null }, false);
    mountWithSlots({ "footer-top": () => null });

    expect(
      warn.mock.calls.filter((call) => String(call[0]).includes("layout.slots."))
    ).toHaveLength(0);
  });
});
