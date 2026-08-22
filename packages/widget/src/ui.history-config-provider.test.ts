// @vitest-environment jsdom

/**
 * Public `features.history.provider`: a host-supplied history backend in a
 * custom-backend session (`apiUrl`, no client token), the factory's
 * once-per-instance contract, registry precedence, and the affordance-hiding
 * optional capabilities.
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
} from "./internal/demo-history-provider";
import type { HistoryProvider } from "./internal/history-provider";
import { HistoryProviderError, isHistoryProviderError } from "./index-core";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [
      { id: "a1", role: "user", content: "where is my order" },
      { id: "a2", role: "assistant", content: "it ships tomorrow" },
    ],
  },
  {
    id: "conv-b",
    title: "Refund request",
    targetId: null,
    messages: [{ id: "b1", role: "user", content: "refund please" }],
  },
];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const mounts: HTMLElement[] = [];
const controllers: Array<ReturnType<typeof createAgentExperience>> = [];

/** Custom-backend session: `apiUrl` only, so client-token mode is off. */
const setup = (
  historyFeature: Record<string, unknown>,
  extraConfig: Record<string, unknown> = {}
) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    features: { history: historyFeature },
    ...extraConfig,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

/** Drops one optional capability without disturbing the closures behind it. */
const without = (
  provider: DemoHistoryProvider,
  key: "update" | "resetDevice"
): HistoryProvider => {
  const next: HistoryProvider = { ...provider, capabilities: provider.capabilities };
  delete next[key];
  return next;
};

const historyButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]");
const rowOf = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-persona-history-conversation="${id}"]`
  );

const openHistoryUI = async (mount: HTMLElement) => {
  historyButton(mount)!.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
  );
  await flush();
};

const listMenuItems = async (mount: HTMLElement) => {
  mount.querySelector<HTMLButtonElement>(".persona-history-list-options")!.click();
  await flush();
  return Array.from(
    mount.querySelectorAll('.persona-history-caption [role="menuitem"]')
  ).map((item) => item.textContent);
};

const starActiveConversation = async (mount: HTMLElement) => {
  mount
    .querySelector('[data-persona-theme-zone="header"]')!
    .dispatchEvent(
      new CustomEvent("persona:title-menu-builtin", {
        bubbles: true,
        detail: { actionId: "star" },
      })
    );
  await flush();
};

describe("features.history.provider", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    // No registry override: this suite exercises the public config path only.
    setHistoryProviderFactory(null);
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

  it("renders the history UI in a custom-backend session and lists conversations", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { mount, controller } = setup({ enabled: true, provider: () => provider });

    expect(historyButton(mount)).not.toBeNull();
    await openHistoryUI(mount);
    expect(mount.querySelector(".persona-history-view")).not.toBeNull();
    expect(rowOf(mount, "conv-a")).not.toBeNull();
    expect(rowOf(mount, "conv-b")).not.toBeNull();

    const page = await controller.listConversations({ limit: 10 });
    expect(page.items.map((item) => item.id)).toEqual(["conv-b", "conv-a"]);
  });

  it("accepts a provider instance as well as a factory", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { mount } = setup({ enabled: true, provider });
    await openHistoryUI(mount);
    expect(rowOf(mount, "conv-a")).not.toBeNull();
  });

  it("calls the factory exactly once per widget instance", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const factory = vi.fn(() => provider);
    const { mount, controller } = setup({ enabled: true, provider: factory });
    expect(factory).toHaveBeenCalledTimes(1);

    // Opening the surface re-reads the provider; it must not rebuild it.
    await openHistoryUI(mount);
    expect(factory).toHaveBeenCalledTimes(1);

    // A reinstall that keeps the same factory reuses the built provider.
    controller.update({ features: { history: { enabled: false, provider: factory } } });
    controller.update({ features: { history: { enabled: true, provider: factory } } });
    await flush();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when a new factory identity arrives through update()", async () => {
    const first = vi.fn(() => createDemoHistoryProvider({ conversations: SEEDS }));
    const second = vi.fn(() =>
      createDemoHistoryProvider({
        conversations: [
          {
            id: "conv-next",
            title: "Next",
            targetId: null,
            messages: [{ id: "n1", role: "user", content: "second backend" }],
          },
        ],
      })
    );
    const { mount, controller } = setup({ enabled: true, provider: first });
    expect(first).toHaveBeenCalledTimes(1);

    controller.update({ features: { history: { enabled: true, provider: second } } });
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
    await openHistoryUI(mount);
    expect(rowOf(mount, "conv-next")).not.toBeNull();
    expect(rowOf(mount, "conv-a")).toBeNull();
  });

  it("lets the internal registry override a config provider", async () => {
    const registryProvider = createDemoHistoryProvider({ conversations: SEEDS });
    setHistoryProviderFactory(() => registryProvider);
    const configFactory = vi.fn(() =>
      createDemoHistoryProvider({
        conversations: [
          {
            id: "conv-config",
            title: "Config",
            targetId: null,
            messages: [{ id: "c1", role: "user", content: "config backend" }],
          },
        ],
      })
    );
    const { mount } = setup({ enabled: true, provider: configFactory });

    await openHistoryUI(mount);
    expect(configFactory).not.toHaveBeenCalled();
    expect(rowOf(mount, "conv-a")).not.toBeNull();
    expect(rowOf(mount, "conv-config")).toBeNull();
  });

  it("narrows the derived scope to what the provider advertises", async () => {
    // getIdentityProof derives "verified-user", but the demo provider serves
    // "browser" only; the derived default must narrow, not fail.
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { mount, controller } = setup(
      { enabled: true, provider: () => provider },
      { getIdentityProof: async () => "proof" }
    );
    await openHistoryUI(mount);
    expect(rowOf(mount, "conv-a")).not.toBeNull();
    await controller.openConversation("conv-a");
    expect(provider.getActiveConversationId()).toBe("conv-a");
  });

  it("fails closed when an explicit scope is outside the provider's set", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { controller } = setup({
      enabled: true,
      provider: () => provider,
      scope: "verified-user",
    });
    await expect(controller.openConversation("conv-a")).rejects.toMatchObject({
      code: "unsupported_scope",
    });
  });

  it("hides the star affordance for a provider without update", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { mount, controller } = setup({
      enabled: true,
      provider: () => without(provider, "update"),
    });
    await controller.openConversation("conv-a");
    await flush();

    await starActiveConversation(mount);
    const page = await controller.listConversations({ limit: 10 });
    expect(page.items.find((item) => item.id === "conv-a")?.starred).toBe(false);
    await expect(
      controller.setConversationStarred("conv-a", true)
    ).rejects.toThrow();
    await expect(
      controller.renameConversation("conv-a", "Renamed")
    ).rejects.toThrow();
  });

  it("keeps the star affordance for a provider with update", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { mount, controller } = setup({ enabled: true, provider: () => provider });
    await controller.openConversation("conv-a");
    await flush();

    await starActiveConversation(mount);
    const page = await controller.listConversations({ limit: 10 });
    expect(page.items.find((item) => item.id === "conv-a")?.starred).toBe(true);
  });

  it("hides forget-this-device for a provider without resetDevice", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const { mount } = setup({ enabled: true, provider: () => provider });
    await openHistoryUI(mount);
    expect(await listMenuItems(mount)).toEqual(["Delete all conversations"]);
  });

  it("offers forget-this-device for a provider with resetDevice", async () => {
    const provider = createDemoHistoryProvider({ conversations: SEEDS });
    const withReset: HistoryProvider = {
      ...provider,
      capabilities: provider.capabilities,
      resetDevice: async () => ({ remoteRevocationConfirmed: false }),
    };
    const { mount } = setup({ enabled: true, provider: () => withReset });
    await openHistoryUI(mount);
    expect(await listMenuItems(mount)).toEqual([
      "Delete all conversations",
      "Forget this device",
    ]);
  });
});

describe("history provider error exports", () => {
  it("round-trips HistoryProviderError through the package entry", () => {
    const error = new HistoryProviderError("rate_limited", "slow down", {
      retryAfterSeconds: 12,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HistoryProviderError);
    expect(error.name).toBe("HistoryProviderError");
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(12);
    expect(isHistoryProviderError(error)).toBe(true);
    expect(isHistoryProviderError(new Error("nope"))).toBe(false);
  });
});
